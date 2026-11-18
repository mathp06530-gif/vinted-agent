const $ = (s) => document.querySelector(s);
const STATUS_LABEL = { brouillon: "À vérifier", prete: "Prête", publiee: "Publiée", vendue: "Vendue" };
const FIELDS = ["title", "description", "hashtags", "brand", "model", "category", "size", "condition", "color", "material", "price", "hints"];
let current = null;          // annonce ouverte dans l'éditeur
let tab = "brouillon";
let newFiles = [];

async function api(url, opts = {}) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

function toast(msg, ms = 3500) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms);
}
function busy(on, text) { $("#busy").hidden = !on; if (text) $("#busy-text").textContent = text; }
const euro = (n) => (n == null || n === "" ? "" : `${Number(n).toLocaleString("fr-FR")} €`);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- liste ----------
async function refresh() {
  const { items, stats } = await api("/api/listings");
  $("#stats").innerHTML = [
    [stats.brouillon, "à vérifier"], [stats.prete, "prêtes, pas encore publiées"],
    [stats.publiee, "en ligne"], [stats.vendue, "vendues"],
    [euro(stats.ca_vendu) || "0 €", "encaissé"],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");

  const counts = { "": items.length, ...Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, stats[k]])) };
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.s === tab);
    b.innerHTML = b.textContent.replace(/\s*\d+$/, "") + `<span class="n">${counts[b.dataset.s] ?? 0}</span>`;
  });

  const list = tab ? items.filter((i) => i.status === tab) : items;
  $("#grid").innerHTML = list.length ? list.map((i) => `
    <button class="item" data-id="${i.id}">
      ${i.photos[0] ? `<img src="/photos/${i.photos[0].filename}" loading="lazy" alt="">` : `<img alt="">`}
      <div class="meta">
        <div class="t">${esc(i.title) || "<em>Sans titre</em>"}</div>
        <div class="p"><span class="price">${euro(i.price)}</span><span class="badge ${i.status}">${STATUS_LABEL[i.status]}</span></div>
      </div>
    </button>`).join("")
    : `<p class="empty">Rien ici pour l'instant.</p>`;
}
$("#grid").addEventListener("click", (e) => { const b = e.target.closest(".item"); if (b) openEditor(+b.dataset.id); });
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { tab = b.dataset.s; refresh(); } });

// ---------- nouvelle annonce ----------
const drop = $("#drop");
function setNewFiles(files) {
  newFiles = [...newFiles, ...[...files].filter((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name))];
  $("#new-thumbs").innerHTML = newFiles.map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join("");
  $("#btn-create").disabled = !newFiles.length;
  $("#btn-create").textContent = newFiles.length ? `Créer l'annonce avec l'agent (${newFiles.length} photo${newFiles.length > 1 ? "s" : ""})` : "Créer l'annonce avec l'agent";
}
$("#new-photos").addEventListener("change", (e) => { setNewFiles(e.target.files); e.target.value = ""; });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => setNewFiles(e.dataTransfer.files));

$("#btn-create").addEventListener("click", async () => {
  const fd = new FormData();
  newFiles.forEach((f) => fd.append("photos", f));
  fd.append("hints", $("#new-hints").value);
  busy(true, "Envoi des photos…");
  try {
    let item = await api("/api/listings", { method: "POST", body: fd });
    newFiles = []; setNewFiles([]); $("#new-hints").value = "";
    busy(true, "L'agent regarde tes photos et rédige l'annonce…");
    try {
      item = await api(`/api/listings/${item.id}/generate`, json("POST"));
      toast("Annonce prête à vérifier");
    } catch (e) { toast(e.message, 6000); }
    tab = "brouillon"; await refresh(); openEditor(item.id);
  } catch (e) { toast(e.message, 6000); }
  busy(false);
});

// ---------- éditeur ----------
async function openEditor(id) {
  current = await api(`/api/listings/${id}`);
  fillEditor();
  if (!$("#editor").open) $("#editor").showModal();
}

function fillEditor() {
  const c = current;
  FIELDS.forEach((f) => { const el = $(`#f-${f}`); if (el) el.value = c[f] ?? ""; });
  $("#price-range").textContent = c.price_min ? `Offres acceptables dès ${euro(c.price_min)}, max conseillé ${euro(c.price_max)}` : "";
  $("#ed-status").className = `badge ${c.status}`;
  $("#ed-status").textContent = STATUS_LABEL[c.status];
  const notes = $("#ed-notes");
  notes.hidden = !c.ai_notes;
  notes.innerHTML = c.ai_notes ? `<b>Note de l'agent (pas publiée)</b>${esc(c.ai_notes)}` : "";
  renderPhotos();

  const actions = {
    brouillon: ["Valider l'annonce", () => setStatus("prete"), "", null,
      "Relis, corrige si besoin, puis valide : elle passe dans « Prêtes à publier »."],
    prete: ["Ouvrir Vinted et pré-remplir", publish, "Marquer publiée", markPublished,
      "Le bouton ouvre Vinted, ajoute les photos, le titre, la description et le prix. Tu vérifies catégorie, marque, taille, état, puis tu cliques toi-même sur « Ajouter »."],
    publiee: ["Marquer vendue", () => setStatus("vendue"), "Remettre en « prête »", () => setStatus("prete"),
      c.vinted_url ? `En ligne : ${c.vinted_url}` : "En ligne sur Vinted."],
    vendue: ["Remettre en ligne", () => setStatus("publiee"), "", null, "Vendue 🎉"],
  }[c.status];
  const [nl, nf, al, af, hint] = actions;
  $("#btn-next").textContent = nl; $("#btn-next").onclick = nf;
  $("#btn-alt").hidden = !al; $("#btn-alt").textContent = al; $("#btn-alt").onclick = af;
  $("#ed-hint").textContent = hint;
}

function renderPhotos() {
  const ph = current.photos;
  $("#ed-photos").innerHTML = ph.map((p, i) => `
    <div class="ph">
      ${i === 0 ? '<span class="cover">couverture</span>' : ""}
      <img src="/photos/${p.filename}" alt="">
      <div class="ctl">
        <button type="button" data-move="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""}>←</button>
        <button type="button" data-del="${p.id}">✕</button>
        <button type="button" data-move="${i}" data-dir="1" ${i === ph.length - 1 ? "disabled" : ""}>→</button>
      </div>
    </div>`).join("");
}
$("#ed-photos").addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.del) {
    if (!confirm("Retirer cette photo ?")) return;
    await api(`/api/photos/${b.dataset.del}`, { method: "DELETE" });
    current = await api(`/api/listings/${current.id}`);
  } else {
    const ids = current.photos.map((p) => p.id);
    const i = +b.dataset.move, j = i + +b.dataset.dir;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    current = await api(`/api/listings/${current.id}/photos/order`, json("POST", { ids }));
  }
  renderPhotos(); refresh();
});
$("#ed-add").addEventListener("change", async (e) => {
  const fd = new FormData(); [...e.target.files].forEach((f) => fd.append("photos", f)); e.target.value = "";
  current = await api(`/api/listings/${current.id}/photos`, { method: "POST", body: fd });
  renderPhotos(); refresh();
});

function formData() {
  const d = {};
  FIELDS.forEach((f) => { const el = $(`#f-${f}`); if (el) d[f] = el.value; });
  d.price = d.price === "" ? null : Number(d.price);
  return d;
}
async function save(quiet) {
  current = await api(`/api/listings/${current.id}`, json("PUT", formData()));
  if (!quiet) toast("Enregistré");
  refresh();
}
async function setStatus(status, extra = {}) {
  await save(true);
  current = await api(`/api/listings/${current.id}`, json("PUT", { status, ...extra }));
  fillEditor(); refresh();
  toast(`Annonce « ${STATUS_LABEL[status]} »`);
}
async function publish() {
  await save(true);
  await api(`/api/listings/${current.id}/publish`, json("POST"));
  toast("Un navigateur s'ouvre sur Vinted… Vérifie l'annonce, clique sur « Ajouter », puis reviens cliquer « Marquer publiée ».", 9000);
}
async function markPublished() {
  const url = prompt("Lien de l'annonce Vinted (facultatif) :", current.vinted_url || "");
  if (url === null) return;
  setStatus("publiee", { vinted_url: url.trim() });
}

$("#btn-save").addEventListener("click", () => save());
$("#btn-delete").addEventListener("click", async () => {
  if (!confirm("Supprimer définitivement cette annonce et ses photos ?")) return;
  await api(`/api/listings/${current.id}`, { method: "DELETE" });
  $("#editor").close(); refresh(); toast("Annonce supprimée");
});

async function regenerate(offline) {
  const btn = offline ? $("#btn-offline") : $("#btn-regen");
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = offline ? "…" : "L'agent réécrit…";
  try {
    await save(true);
    current = await api(`/api/listings/${current.id}/generate`, json("POST", { hints: $("#regen-hint").value, offline }));
    $("#regen-hint").value = "";
    fillEditor(); refresh(); toast("Nouvelle version");
  } catch (e) { toast(e.message, 6000); }
  btn.disabled = false; btn.textContent = label;
}
$("#btn-regen").addEventListener("click", () => regenerate(false));
$("#btn-offline").addEventListener("click", () => regenerate(true));

document.querySelectorAll(".copy").forEach((b) => b.addEventListener("click", async () => {
  const d = formData();
  const text = b.dataset.copy === "title" ? d.title : [d.description, d.hashtags].filter(Boolean).join("\n\n");
  try { await navigator.clipboard.writeText(text); toast("Copié"); }
  catch { toast("Copie impossible ici, sélectionne le texte à la main"); }
}));

// ---------- réglages ----------
const SET_FIELDS = ["provider", "groq_api_key", "groq_vision_model", "groq_text_model", "api_key", "model",
  "style", "marge_prix", "emojis", "tutoiement", "signature"];
const opts = (o) => Object.entries(o).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
function showProvider() {
  const p = $("#s-provider").value;
  $("#prov-groq").hidden = p !== "groq"; $("#prov-anthropic").hidden = p !== "anthropic";
}
$("#s-provider").addEventListener("change", showProvider);
$("#btn-settings").addEventListener("click", async () => {
  const s = await api("/api/settings");
  $("#s-model").innerHTML = opts(s.models);
  $("#s-groq_vision_model").innerHTML = opts(s.groq_vision_models);
  $("#s-groq_text_model").innerHTML = opts(s.groq_text_models);
  SET_FIELDS.forEach((f) => { $(`#s-${f}`).value = String(s[f] ?? ""); });
  $("#s-hashtags").checked = !!s.hashtags;
  $("#key-state").textContent = s.api_key_set ? `configurée (${s.api_key_hint})` : "pas encore configurée";
  $("#gkey-state").textContent = s.groq_key_set ? `configurée (${s.groq_key_hint})` : "pas encore configurée";
  showProvider();
  $("#settings").showModal();
});
$("#btn-set-save").addEventListener("click", async () => {
  const d = {};
  SET_FIELDS.forEach((f) => { d[f] = $(`#s-${f}`).value; });
  d.tutoiement = d.tutoiement === "true";
  d.hashtags = $("#s-hashtags").checked;
  await api("/api/settings", json("POST", d));
  $("#s-api_key").value = ""; $("#s-groq_api_key").value = "";
  $("#settings").close(); toast("Réglages enregistrés");
});

refresh();
api("/api/settings").then((s) => {
  const ok = s.provider === "groq" ? s.groq_key_set : s.api_key_set;
  if (!ok) toast("Commence par mettre ta clé Groq (gratuite) dans Réglages pour activer l'agent", 7000);
});
