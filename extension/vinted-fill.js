// Sur Vinted : remplit « Vendre un article » avec l'annonce envoyée par l'appli.
// Ne clique JAMAIS sur « Ajouter » : c'est toi qui vérifies et qui publies.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));

  async function waitFor(fn, timeout = 15000, step = 250) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); }
    return null;
  }

  // ---------- trouver les champs ----------
  // par attributs connus de Vinted, sinon par le texte du libellé à côté du champ
  function byLabel(words, selector = "input, textarea") {
    const want = words.map(norm);
    for (const el of document.querySelectorAll(selector)) {
      if (!visible(el) || el.type === "file" || el.type === "hidden") continue;
      const texts = [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.dataset.testid,
        el.labels?.[0]?.textContent, el.closest("label, [class*='field'], [class*='Field'], [class*='input'], [class*='Input']")?.textContent]
        .filter(Boolean).map(norm);
      if (want.some((w) => texts.some((t) => t.includes(w)))) return el;
    }
    return null;
  }
  const field = {
    title: () => document.querySelector("[data-testid='title--input'], input[name='title'], input#title") || byLabel(["titre"], "input"),
    description: () => document.querySelector("[data-testid='description--input'], textarea[name='description'], textarea#description") || byLabel(["decris", "description"], "textarea"),
    price: () => document.querySelector("[data-testid='price-input--input'], input[name='price'], input#price") || byLabel(["prix"], "input"),
    photos: () => document.querySelector("input[type='file'][accept*='image'], input[type='file']"),
  };

  // valeur dans un champ géré par React : setter natif + événements
  function setValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function dataUrlToFile(dataUrl, name) {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], name, { type: blob.type || "image/jpeg" });
  }

  // ---------- listes déroulantes Vinted (catégorie, marque, taille, état, couleur) ----------
  function openTrigger(words) {
    const want = words.map(norm);
    const candidates = [...document.querySelectorAll("[data-testid*='select'], [data-testid*='dropdown'], [role='combobox'], input[readonly], button, [class*='Cell'], [class*='cell']")]
      .filter(visible);
    for (const el of candidates) {
      const t = norm([el.dataset.testid, el.getAttribute("aria-label"), el.placeholder, el.name, el.textContent].filter(Boolean).join(" "));
      if (want.some((w) => t.includes(w)) && t.length < 120) return el;
    }
    return null;
  }
  function options() {
    return [...document.querySelectorAll("[role='option'], [role='listbox'] li, [data-testid*='dropdown'] li, [class*='Cell'][role='button'], [class*='cell'][role='button'], li [class*='Cell'], li")]
      .filter((el) => visible(el) && norm(el.textContent).length > 0 && norm(el.textContent).length < 80);
  }
  function bestOption(text) {
    const want = norm(text);
    const opts = options();
    return opts.find((o) => norm(o.textContent) === want)
      || opts.find((o) => norm(o.textContent).startsWith(want))
      || opts.find((o) => want.length >= 4 && norm(o.textContent).includes(want));
  }
  async function pick(words, value, { search = false } = {}) {
    if (!value) return "vide";
    const trigger = openTrigger(words);
    if (!trigger) return "champ introuvable";
    trigger.scrollIntoView({ block: "center" });
    trigger.click(); trigger.focus?.();
    await sleep(500);
    if (search) {
      // marque : on tape le nom pour filtrer la longue liste
      const box = document.activeElement?.matches?.("input") ? document.activeElement
        : [...document.querySelectorAll("input[type='text'], input[type='search'], input:not([type])")].filter(visible).pop();
      if (box) { setValue(box, value); await sleep(900); }
    }
    const opt = await waitFor(() => bestOption(value), 4000);
    if (!opt) { document.body.click(); return "option introuvable"; }
    opt.scrollIntoView({ block: "center" }); opt.click(); await sleep(400);
    return "ok";
  }
  async function pickCategory(path) {
    const parts = String(path || "").split(">").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return "vide";
    const trigger = openTrigger(["categorie", "catalog"]);
    if (!trigger) return "champ introuvable";
    trigger.scrollIntoView({ block: "center" }); trigger.click(); await sleep(600);
    for (const [i, part] of parts.entries()) {
      // « Hommes » / « Femmes » : Vinted dit parfois « Homme » / « Femme »
      const variants = [part, part.replace(/s$/, ""), part + "s"];
      let opt = null;
      for (const v of variants) { opt = await waitFor(() => bestOption(v), i ? 2500 : 4000); if (opt) break; }
      if (!opt) return i ? `arrêté à « ${parts.slice(0, i).join(" > ")} »` : "option introuvable";
      opt.click(); await sleep(600);
    }
    return "ok";
  }

  // ---------- panneau d'état sur la page ----------
  function panel() {
    let p = document.getElementById("va-panel");
    if (p) return p;
    p = document.createElement("div");
    p.id = "va-panel";
    p.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;max-height:70vh;overflow:auto;"
      + "background:#1d2327;color:#fff;border-radius:14px;padding:14px 16px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)";
    document.body.appendChild(p);
    return p;
  }
  function show(title, rows, foot) {
    const ic = { ok: "✅", vide: "➖" };
    panel().innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <b>🧥 Vinted Agent</b><a href="#" id="va-x" style="color:#9fd;text-decoration:none">masquer</a></div>
      <div style="margin:6px 0 8px;font-weight:600">${title}</div>
      ${rows.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:2px 0">
        <span>${k}</span><span style="text-align:right;opacity:.95">${ic[v] || "✋ " + v}</span></div>`).join("")}
      ${foot ? `<div style="margin-top:10px;font-size:13px;opacity:.9">${foot}</div>` : ""}`;
    document.getElementById("va-x").onclick = (e) => { e.preventDefault(); panel().remove(); };
  }

  // ---------- remplissage ----------
  async function fill(L) {
    const rows = [];
    show("Remplissage en cours…", rows);
    const form = await waitFor(() => field.title() || field.photos(), 20000);
    if (!form) { show("Formulaire Vinted introuvable", [["Es-tu connecté à Vinted ?", "à vérifier"]]); return; }

    // photos (avec le fond studio)
    const input = field.photos();
    if (input && L.photos?.length) {
      const dt = new DataTransfer();
      for (const [i, d] of L.photos.entries()) dt.items.add(await dataUrlToFile(d, `photo-${i + 1}.jpg`));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      rows.push([`Photos (${L.photos.length})`, "ok"]);
      await sleep(1500 + 400 * L.photos.length);
    } else rows.push(["Photos", input ? "aucune" : "champ introuvable"]);
    show("Remplissage en cours…", rows);

    for (const [k, label, val] of [["title", "Titre", L.title], ["description", "Description", L.description], ["price", "Prix", L.price ? String(Math.round(L.price)) : ""]]) {
      const el = val ? field[k]() : null;
      if (val && el) { el.scrollIntoView({ block: "center" }); el.focus(); setValue(el, val); rows.push([label, "ok"]); }
      else rows.push([label, val ? "champ introuvable" : "vide"]);
      show("Remplissage en cours…", rows);
      await sleep(250);
    }

    rows.push(["Catégorie", await pickCategory(L.category)]); show("Remplissage en cours…", rows);
    rows.push(["Marque", await pick(["marque", "brand"], L.brand, { search: true })]); show("Remplissage en cours…", rows);
    rows.push(["Taille", await pick(["taille", "size"], L.size)]); show("Remplissage en cours…", rows);
    rows.push(["État", await pick(["etat", "status", "condition"], L.condition)]); show("Remplissage en cours…", rows);
    const color = String(L.color || "").split(/ et |,|\//)[0].trim();
    rows.push(["Couleur", await pick(["couleur", "color"], color)]);

    await send({ type: "filled" });
    const todo = rows.filter(([, v]) => v !== "ok" && v !== "vide").length;
    show(todo ? `Presque fini : ${todo} champ(s) à compléter à la main (✋)` : "Tout est rempli ✨", rows,
      "Vérifie l'annonce, puis clique toi-même sur <b>« Ajouter »</b>. Vinted Agent passera l'annonce en « Publiée » tout seul.");
    // on met le bouton de publication en évidence, sans cliquer dessus
    const add = [...document.querySelectorAll("button")].find((b) => /^(ajouter|publier)/.test(norm(b.textContent)));
    if (add) { add.style.outline = "3px solid #09b1ba"; add.style.outlineOffset = "3px"; }
  }

  async function main() {
    const path = location.pathname;
    if (/\/items\/new/.test(path)) {
      const { pending } = (await send({ type: "getPending" })) || {};
      if (!pending || pending.filledAt) return;
      await fill(pending);
    } else if (/\/items\/\d+/.test(path)) {
      // page de l'annonce juste publiée : on prévient l'appli
      await send({ type: "published", url: location.origin + location.pathname });
    }
  }

  // Vinted change de page sans recharger : on surveille l'adresse
  let last = "";
  const tick = () => { if (location.href !== last) { last = location.href; main().catch(() => {}); } };
  tick();
  setInterval(tick, 1000);
})();
