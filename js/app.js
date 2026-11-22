import * as store from "./store.js?v=24";
import { generate, VISION_MODELS, TEXT_MODELS, MAX_IMAGES, LOCKABLE } from "./agent.js?v=24";
import { toJpeg, makeSheets, blobToBase64, studioPhoto } from "./images.js?v=24";
import { allBrands } from "./brands.js?v=24";

const $ = (s) => document.querySelector(s);
const STATUS_LABEL = { brouillon: "À vérifier", prete: "Prête", publiee: "Publiée", vendue: "Vendue" };
const FIELDS = ["title", "description", "hashtags", "gender", "brand", "model", "category", "size", "condition", "color", "material", "price", "hints"];
const DEFAULT_SETTINGS = {
  groq_api_key: "", groq_vision_model: Object.keys(VISION_MODELS)[0], groq_text_model: "openai/gpt-oss-120b",
  tutoiement: true, emojis: "rare", hashtags: true, double_check: true, studio_auto: true, studio_style: "blanc", signature: "", style: "naturel", marge_prix: "normal",
};
let cfg = { ...DEFAULT_SETTINGS };
let items = [];
let current = null;
let tab = "brouillon";
let newFiles = [];

// ---------- petits outils ----------
// Copie : presse-papiers moderne, sinon méthode classique (anciens téléphones, navigateurs intégrés)
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* méthode de secours */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  ([...document.querySelectorAll("dialog[open]")].pop() || document.body).appendChild(ta);
  ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}
function toast(msg, ms = 3500) {
  const t = $("#toast");
  // les fenêtres ouvertes passent au-dessus de tout : on y place le message pour qu'il reste visible
  const host = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
  if (t.parentElement !== host) host.appendChild(t);
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms);
}
function busy(on, text) { $("#busy").hidden = !on; if (text) $("#busy-text").textContent = text; }
const euro = (n) => (n == null || n === "" ? "" : `${Number(n).toLocaleString("fr-FR")} €`);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const show = (id) => ["setup", "login", "app"].forEach((s) => { $(`#screen-${s}`).hidden = s !== id; });
async function guard(fn) { try { return await fn(); } catch (e) { toast(e.message || String(e), 6000); } }

// ---------- démarrage ----------
async function start() {
  if (!store.configured) return show("setup");
  const user = await store.currentUser();
  if (!user) { $("#btn-settings").hidden = true; $("#btn-brands").hidden = true; $("#who").textContent = "Tes annonces, préparées pour toi"; return show("login"); }
  $("#who").textContent = user.email;
  $("#btn-settings").hidden = false;
  $("#btn-brands").hidden = false;
  show("app");
  cfg = { ...DEFAULT_SETTINGS, ...(await guard(store.loadSettings)) };
  fillBrandOptions();
  await refresh();
  if (!cfg.groq_api_key) toast("Commence par mettre ta clé Groq (gratuite) dans Réglages", 7000);
}

// ---------- connexion ----------
let signupMode = false;
$("#btn-toggle-signup").addEventListener("click", () => {
  signupMode = !signupMode;
  $("#login-title").textContent = signupMode ? "Créer mon compte" : "Connexion";
  $("#btn-login").textContent = signupMode ? "Créer le compte" : "Se connecter";
  $("#btn-toggle-signup").textContent = signupMode ? "J'ai déjà un compte" : "Créer mon compte";
  $("#l-pass").autocomplete = signupMode ? "new-password" : "current-password";
});
$("#btn-login").addEventListener("click", async () => {
  const email = $("#l-email").value.trim(), pass = $("#l-pass").value;
  if (!email || pass.length < 6) return ($("#login-msg").textContent = "Email et mot de passe (6 caractères min).");
  $("#login-msg").textContent = "…";
  try {
    if (signupMode) {
      const ready = await store.signUp(email, pass);
      if (!ready) return ($("#login-msg").textContent = "Compte créé. Clique sur le lien reçu par email, puis reviens te connecter.");
    } else {
      await store.signIn(email, pass);
    }
    $("#login-msg").textContent = ""; $("#l-pass").value = "";
    start();
  } catch (e) { $("#login-msg").textContent = e.message; }
});
$("#l-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-login").click(); });

// ---------- liste ----------
async function refresh() {
  items = (await guard(store.listListings)) || items;
  const count = (s) => items.filter((i) => i.status === s).length;
  const sum = (s) => items.filter((i) => i.status === s).reduce((a, i) => a + Number(i.price || 0), 0);
  $("#stats").innerHTML = [
    [count("brouillon"), "à vérifier"], [count("prete"), "prêtes, pas encore publiées"],
    [count("publiee"), "en ligne"], [count("vendue"), "vendues"], [euro(sum("vendue")) || "0 €", "encaissé"],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");

  document.querySelectorAll("#tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.s === tab);
    const n = b.dataset.s ? filterTab(b.dataset.s).length : items.length;
    b.innerHTML = b.textContent.replace(/\s*\d+$/, "") + `<span class="n">${n}</span>`;
  });

  const list = tab ? filterTab(tab) : items;
  const covers = await guard(() => store.photoUrls(list.map((i) => i.photos[0]).filter(Boolean))) || {};
  $("#grid").innerHTML = list.length ? list.map((i) => `
    <button class="item" data-id="${i.id}">
      ${i.photos[0] && covers[i.photos[0]] ? `<img src="${covers[i.photos[0]]}" loading="lazy" alt="">` : `<img alt="">`}
      <div class="meta">
        <div class="t">${esc(i.title) || "<em>Sans titre</em>"}</div>
        <div class="p"><span class="price">${euro(i.price)}</span><span class="badge ${i.status}">${STATUS_LABEL[i.status]}</span></div>
        ${AUTH_BADGE[i.authenticity] || ""}
      </div>
    </button>`).join("")
    : `<p class="empty">${tab === "douteuses" ? "Aucune pièce douteuse. L'agent range ici celles qui lui paraissent suspectes." : "Rien ici pour l'instant."}</p>`;
}
const AUTH_BADGE = {
  douteux: '<span class="auth-badge warn">⚠️ Douteuse</span>',
  fausse: '<span class="auth-badge bad">✗ Fausse</span>',
  authentique: '<span class="auth-badge ok">✓ Vérifiée</span>',
};
function filterTab(t) {
  if (t === "douteuses") return items.filter((i) => ["douteux", "fausse"].includes(i.authenticity));
  return items.filter((i) => i.status === t);
}
$("#grid").addEventListener("click", (e) => { const b = e.target.closest(".item"); if (b) openEditor(+b.dataset.id); });
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { tab = b.dataset.s; refresh(); } });
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#screen-app").hidden && !$("#editor").open) refresh(); });

// ---------- nouvelle annonce ----------
const drop = $("#drop");
function setNewFiles(files) {
  $("#new-thumbs").querySelectorAll("img").forEach((i) => URL.revokeObjectURL(i.src));
  newFiles = [...newFiles, ...[...files].filter((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name))];
  newLabels = new Set([...newLabels].filter((i) => i < newFiles.length));
  $("#new-thumbs").innerHTML = newFiles.map((f, i) => `<span class="thumb ${newLabels.has(i) ? "on" : ""}" data-i="${i}">
    <img src="${URL.createObjectURL(f)}" alt="">${newLabels.has(i) ? "<b>🏷️</b>" : ""}</span>`).join("");
  $("#new-label-hint").hidden = !newFiles.length;
  $("#btn-create").disabled = !newFiles.length;
  $("#btn-create").textContent = newFiles.length ? `Créer l'annonce avec l'agent (${newFiles.length} photo${newFiles.length > 1 ? "s" : ""})` : "Créer l'annonce avec l'agent";
}
let newLabels = new Set();
// toucher une vignette = la marquer comme photo d'étiquette (sans rouvrir la galerie)
$("#new-thumbs").addEventListener("click", (e) => {
  const t = e.target.closest(".thumb"); if (!t) return;
  e.preventDefault(); e.stopPropagation();
  const i = +t.dataset.i;
  if (newLabels.has(i)) newLabels.delete(i);
  else if (newLabels.size >= 2) return toast("2 photos d'étiquette maximum.");
  else newLabels.add(i);
  setNewFiles([]);
});
$("#new-photos").addEventListener("change", (e) => { setNewFiles(e.target.files); e.target.value = ""; });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => setNewFiles(e.dataTransfer.files));

async function uploadFiles(files, onProgress) {
  const paths = [], blobs = [], skipped = [], kept = [];
  for (const [i, f] of [...files].entries()) {
    onProgress?.(`Envoi des photos ${i + 1}/${files.length}…`);
    let jpeg;
    try { jpeg = await toJpeg(f); } catch { skipped.push(f.name); continue; }
    paths.push(await store.uploadPhoto(jpeg));
    blobs.push(jpeg);
    kept.push(i);
  }
  if (skipped.length) toast(`${skipped.length} photo(s) illisible(s) ignorée(s) (format non supporté ici) : ${skipped.join(", ")}`, 7000);
  if (!paths.length) throw new Error("Aucune photo n'a pu être lue. Essaie en JPEG ou PNG.");
  return { paths, blobs, kept };
}

async function runAgent(listing, blobs, extraHints, onStep) {
  const originals = listing.manual?._originals || {};
  if (!blobs) blobs = await Promise.all(listing.photos.map((p) => store.downloadPhoto(originals[p] || p)));
  // photos marquées 🏷️ (étiquettes) : envoyées seules et en grand (2 max), le reste regroupé
  const labels = listing.manual?._labels || [];
  const labelIdx = listing.photos.map((p, i) => (labels.includes(p) ? i : -1)).filter((i) => i >= 0).slice(0, 2);
  const others = blobs.filter((_, i) => !labelIdx.includes(i));
  const photosB64 = [
    ...(await Promise.all(labelIdx.map((i) => blobToBase64(blobs[i])))),
    ...(others.length ? await makeSheets(others, MAX_IMAGES - labelIdx.length) : []),
  ];
  const labelCount = labelIdx.length;
  // Tes verdicts (vraie / fausse) servent d'exemples à l'agent : les 15 plus récents
  const examples = items
    .filter((i) => i.id !== listing.id && ["fausse", "authentique"].includes(i.authenticity))
    .slice(0, 15)
    .map(({ title, brand, authenticity, auth_reason }) => ({ title, brand, authenticity, auth_reason }));
  const corrections = (cfg.corrections || []).slice(-25);
  const fields = await generate({ key: cfg.groq_api_key, cfg, listing, photosB64, labelCount, extraHints, examples, corrections, onStep });
  return store.updateListing(listing.id, fields);
}

$("#btn-create").addEventListener("click", async () => {
  const btn = $("#btn-create");
  if (btn.dataset.busy) return; // pas de double création
  btn.dataset.busy = "1"; btn.disabled = true;
  const files = newFiles, hints = $("#new-hints").value.trim();
  const gender = $("#new-gender").value, size = $("#new-size").value.trim();
  const manual = Object.fromEntries(Object.entries({ gender, size }).filter(([, v]) => v));
  const labelIdx = [...newLabels];
  busy(true, "Préparation des photos…");
  let item;
  try {
    const { paths, blobs, kept } = await uploadFiles(files, (t) => busy(true, t));
    const labelPaths = labelIdx.map((i) => kept.indexOf(i)).filter((k) => k >= 0).map((k) => paths[k]);
    if (labelPaths.length) manual._labels = labelPaths;
    try {
      item = await store.createListing({ hints, photos: paths, gender, size, manual });
    } catch (e) {
      paths.forEach((p) => store.removePhoto(p)); // pas de photos orphelines
      throw e;
    }
    newFiles = []; newLabels = new Set(); setNewFiles([]);
    $("#new-hints").value = ""; $("#new-gender").value = ""; $("#new-size").value = "";
    try {
      item = await runAgent(item, blobs, "", (t) => busy(true, t));
      agentErrors.delete(item.id);
      toast("Annonce prête à vérifier");
    } catch (e) { agentErrors.set(item.id, e.message); } // affiché dans la fiche
    tab = "brouillon"; await refresh(); busy(false); await openEditor(item.id);
    if (cfg.studio_auto !== false) studioize(item.id); // en arrière-plan, pendant que tu relis
  } catch (e) { toast(e.message, 7000); }
  busy(false);
  delete btn.dataset.busy;
  btn.disabled = !newFiles.length;
});

// ---------- éditeur ----------
const agentErrors = new Map(); // id annonce -> dernière erreur de l'agent

// Encadré en haut de la fiche : annonce pas encore rédigée, ou erreur de l'agent
function renderAgentBox() {
  const c = current;
  const err = agentErrors.get(c.id);
  const empty = !c.title && !c.description;
  const noKey = !cfg.groq_api_key;
  const box = $("#agent-box");
  box.hidden = !(err || empty);
  box.classList.toggle("error", Boolean(err));
  $("#agent-msg").textContent = noKey
    ? "L'agent ne peut pas travailler : ta clé Groq n'est pas encore enregistrée. Ouvre Réglages, colle ta clé, puis lance l'agent."
    : err ? `L'agent n'a pas réussi : ${err}`
    : "L'agent n'a pas encore rédigé cette annonce.";
  $("#btn-agent-settings").hidden = !noKey;
  $("#btn-agent").textContent = err ? "Réessayer" : "Lancer l'agent";
}

async function runAgentInEditor(btn) {
  const label = btn.textContent;
  const id = current?.id;
  if (!id) return;
  document.querySelectorAll("#btn-agent, #btn-regen").forEach((b) => { b.disabled = true; });
  try {
    await save(true);
    current = await runAgent(current, null, $("#regen-hint").value, (t) => { btn.textContent = t; });
    agentErrors.delete(id);
    $("#regen-hint").value = "";
    await fillEditor(); refresh(); toast("Annonce rédigée");
  } catch (e) {
    agentErrors.set(id, e.message);
    if (current) renderAgentBox();
    $("#agent-box").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  document.querySelectorAll("#btn-agent, #btn-regen").forEach((b) => { b.disabled = false; });
  btn.textContent = label;
  if (current) renderAgentBox();
}
$("#btn-agent").addEventListener("click", (e) => runAgentInEditor(e.currentTarget));
$("#btn-agent-settings").addEventListener("click", () => $("#btn-settings").click());

async function openEditor(id) {
  current = await guard(() => store.getListing(id));
  if (!current) return;
  edited.clear();
  $("#regen-hint").value = "";
  await fillEditor();
  if (!$("#editor").open) $("#editor").showModal();
}

async function fillEditor() {
  const c = current;
  FIELDS.forEach((f) => { const el = $(`#f-${f}`); if (el) el.value = c[f] ?? ""; });
  $("#price-range").textContent = c.price_min ? `Offres acceptables dès ${euro(c.price_min)}, max conseillé ${euro(c.price_max)}` : "";
  $("#ed-status").className = `badge ${c.status}`;
  $("#ed-status").textContent = STATUS_LABEL[c.status];
  $("#ed-notes").hidden = !c.ai_notes;
  $("#ed-notes").innerHTML = c.ai_notes ? `<b>Note de l'agent (pas publiée)</b>${esc(c.ai_notes)}` : "";
  $("#publish-help").hidden = c.status !== "prete";
  renderAgentBox();
  await renderPhotos();

  const [nl, nf, al, af, hint] = {
    brouillon: ["Valider l'annonce", validate, "", null,
      "Relis, corrige si besoin, puis valide : elle passe dans « Prêtes à publier »."],
    prete: ["Marquer publiée", markPublished, "Remettre à vérifier", () => setStatus("brouillon"), ""],
    publiee: ["Marquer vendue", () => setStatus("vendue"), "Remettre en « prête »", () => setStatus("prete"),
      c.vinted_url ? `En ligne : ${c.vinted_url}` : "En ligne sur Vinted."],
    vendue: ["Remettre en ligne", () => setStatus("publiee"), "", null, "Vendue 🎉"],
  }[c.status];
  $("#btn-next").textContent = nl; $("#btn-next").onclick = nf;
  $("#btn-alt").hidden = !al; $("#btn-alt").textContent = al; $("#btn-alt").onclick = af;
  $("#ed-hint").textContent = hint;
  // Pièce jugée fausse : on bloque la publication
  const fake = c.authenticity === "fausse";
  $("#btn-next").hidden = fake && ["brouillon", "prete"].includes(c.status);
  $("#publish-help").hidden = fake || c.status !== "prete";
  $("#ext-on").hidden = !extensionReady;
  $("#ext-off").hidden = extensionReady || /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (fake) $("#ed-hint").textContent = "Contrefaçon : ne la publie pas sur Vinted (interdit, risque de blocage du compte).";
  renderAuthBox();
  renderLocks();
  renderStudio();
}

// ---------- authenticité ----------
function renderAuthBox() {
  const c = current, a = c.authenticity || "";
  const box = $("#auth-box");
  box.hidden = !a; // rien à montrer si l'agent n'a rien signalé et pas de verdict
  box.className = `auth-box ${a}`;
  $("#auth-title").textContent = {
    douteux: "⚠️ L'agent pense que cette pièce est peut-être une contrefaçon",
    fausse: "✗ Tu as marqué cette pièce comme fausse",
    authentique: "✓ Tu as vérifié : pièce authentique",
  }[a] || "";
  $("#auth-reason").textContent = c.auth_reason || "";
  $("#auth-why").value = "";
}
async function setVerdict(verdict) {
  const why = $("#auth-why").value.trim();
  await guard(async () => {
    current = await store.updateListing(current.id, {
      authenticity: verdict,
      auth_reason: why || current.auth_reason || "",
    });
    await fillEditor(); refresh();
    toast(verdict === "fausse" ? "Marquée fausse. L'agent s'en souviendra." : "Marquée authentique. L'agent s'en souviendra.");
  });
}
$("#btn-auth-real").addEventListener("click", () => setVerdict("authentique"));
$("#btn-auth-fake").addEventListener("click", () => setVerdict("fausse"));

// ---------- fond studio ----------
const studioJobs = new Map(); // id annonce -> { done, total, text }
function renderStudio() {
  if (!current) return;
  const job = studioJobs.get(current.id);
  $("#studio-progress").hidden = !job;
  $("#btn-studio").disabled = Boolean(job);
  $("#btn-originals").hidden = Boolean(job) || !Object.keys(current.manual?._originals || {}).some((p) => current.photos.includes(p));
  if (job) {
    $("#studio-bar").style.width = `${Math.round((100 * job.done) / job.total)}%`;
    $("#studio-text").textContent = job.text || `Fond studio : photo ${Math.min(job.done + 1, job.total)} sur ${job.total}… (tu peux continuer à relire)`;
  }
}
async function studioize(listingId) {
  if (studioJobs.has(listingId)) return;
  let L = await store.getListing(listingId);
  const labels = L.manual?._labels || [];
  const done0 = L.manual?._originals || {};
  const todo = L.photos.filter((p) => !done0[p] && !labels.includes(p)); // jamais les photos d'étiquette
  if (!todo.length) { if (current?.id === listingId) toast("Toutes les photos ont déjà le fond studio."); return; }
  const job = { done: 0, total: todo.length, errors: 0 };
  studioJobs.set(listingId, job); renderStudio();
  for (const path of todo) {
    try {
      const out = await studioPhoto(await store.downloadPhoto(path), {
        style: cfg.studio_style, onProgress: (t) => { job.text = t; renderStudio(); },
      });
      const np = await store.uploadPhoto(out);
      L = await store.getListing(listingId); // version fraîche : tu as pu modifier la fiche entre-temps
      if (!L.photos.includes(path)) { store.removePhoto(np); continue; } // photo retirée pendant le travail
      const photos = L.photos.map((x) => (x === path ? np : x));
      const manual = { ...(L.manual || {}), _originals: { ...(L.manual?._originals || {}), [np]: path } };
      L = await store.updateListing(listingId, { photos, manual });
      if (current?.id === listingId) { current = { ...current, photos: L.photos, manual: L.manual }; await renderPhotos(); }
    } catch (e) {
      job.errors++; job.lastError = e.message;
    } finally {
      job.done++; job.text = ""; renderStudio();
    }
  }
  studioJobs.delete(listingId);
  renderStudio(); refresh();
  toast(job.errors
    ? `Fond studio : ${job.total - job.errors} photo(s) sur ${job.total}. ${job.lastError}`
    : "Fond studio appliqué ✨", job.errors ? 7000 : 3500);
}
$("#btn-studio").addEventListener("click", () => current && studioize(current.id));
$("#btn-originals").addEventListener("click", () => guard(async () => {
  const orig = current.manual?._originals || {};
  const studio = Object.keys(orig).filter((p) => current.photos.includes(p));
  if (!studio.length) return;
  if (!confirm("Remettre les photos d'origine (sans le fond studio) ?")) return;
  const photos = current.photos.map((p) => orig[p] || p);
  current = await store.updateListing(current.id, { photos, manual: { ...(current.manual || {}), _originals: {} } });
  studio.forEach((p) => store.removePhoto(p));
  await renderPhotos(); renderStudio(); refresh(); toast("Photos d'origine remises");
}));

async function renderPhotos() {
  const ph = current.photos;
  const labels = current.manual?._labels || [];
  const urls = await guard(() => store.photoUrls(ph)) || {};
  $("#ed-photos").innerHTML = ph.map((p, i) => `
    <div class="ph">
      ${i === 0 ? '<span class="cover">couverture</span>' : ""}
      <button type="button" class="tag-btn ${labels.includes(p) ? "on" : ""}" data-label="${i}"
        title="Marquer comme photo d'étiquette">🏷️${labels.includes(p) ? " étiquette" : ""}</button>
      <img src="${urls[p] || ""}" alt="">
      <div class="ctl">
        <button type="button" data-move="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""}>←</button>
        <button type="button" data-del="${i}">✕</button>
        <button type="button" data-move="${i}" data-dir="1" ${i === ph.length - 1 ? "disabled" : ""}>→</button>
      </div>
    </div>`).join("");
}
$("#ed-photos").addEventListener("click", (e) => guard(async () => {
  const b = e.target.closest("button"); if (!b) return;
  const photos = [...current.photos];
  if (b.dataset.label !== undefined) {
    const path = photos[+b.dataset.label];
    const labels = new Set(current.manual?._labels || []);
    if (labels.has(path)) labels.delete(path);
    else {
      if ([...labels].filter((l) => photos.includes(l)).length >= 2) return toast("2 photos d'étiquette maximum.");
      labels.add(path);
    }
    current = await store.updateListing(current.id, { manual: { ...(current.manual || {}), _labels: [...labels] } });
    toast(labels.has(path) ? "Photo d'étiquette : l'agent la lira en grand. Relance « Réécrire »." : "Photo normale");
  } else if (b.dataset.del !== undefined) {
    if (!confirm("Retirer cette photo ?")) return;
    const [removed] = photos.splice(+b.dataset.del, 1);
    const orig = { ...(current.manual?._originals || {}) };
    const original = orig[removed]; delete orig[removed];
    current = await store.updateListing(current.id, { photos, manual: { ...(current.manual || {}), _originals: orig } });
    store.removePhoto(removed);
    if (original) store.removePhoto(original);
  } else {
    const i = +b.dataset.move, j = i + +b.dataset.dir;
    [photos[i], photos[j]] = [photos[j], photos[i]];
    current = await store.updateListing(current.id, { photos });
  }
  await renderPhotos(); refresh();
}));
$("#ed-add").addEventListener("change", (e) => guard(async () => {
  const files = [...e.target.files]; e.target.value = "";
  toast("Envoi des photos…");
  const { paths } = await uploadFiles(files);
  current = await store.updateListing(current.id, { photos: [...current.photos, ...paths] });
  await renderPhotos(); refresh(); toast("Photos ajoutées");
}));

// Champs modifiés à la main depuis l'ouverture de la fiche : ils deviennent imposés à l'agent
const edited = new Set();
LOCKABLE.forEach((f) => {
  const el = $(`#f-${f}`);
  const mark = () => { edited.add(f); el.closest(".field")?.classList.remove("unsure"); };
  el?.addEventListener("input", mark);
  el?.addEventListener("change", mark);
});
function renderLocks() {
  const manual = current?.manual || {}, conf = current?.ai_confidence || {};
  LOCKABLE.forEach((f) => {
    const field = $(`#f-${f}`)?.closest(".field");
    const label = field?.querySelector("label");
    if (label) label.dataset.lock = manual[f] ? "1" : "";
    // l'agent n'est pas sûr de ce champ et tu ne l'as pas encore vérifié
    field?.classList.toggle("unsure", !manual[f] && !edited.has(f) && conf[f] === "basse");
  });
  const n = document.querySelectorAll("#editor .field.unsure").length;
  $("#unsure-hint").hidden = !n;
  $("#unsure-hint").textContent = `L'agent n'est pas sûr de ${n} champ${n > 1 ? "s" : ""} (en orange) : vérifie-le${n > 1 ? "s" : ""}.`;
}

function formData() {
  const d = {};
  FIELDS.forEach((f) => { const el = $(`#f-${f}`); if (el) d[f] = el.value.trim(); });
  d.price = d.price === "" ? null : Math.round(Number(d.price));
  const manual = { ...(current?.manual || {}) };
  edited.forEach((f) => { if (d[f] === "" || d[f] == null) delete manual[f]; else manual[f] = d[f]; });
  d.manual = manual;
  return d;
}
function isDirty() {
  if (!current) return false;
  const d = formData();
  return edited.size > 0 || FIELDS.some((k) => String(d[k] ?? "") !== String(current[k] ?? ""));
}
const LEARN = ["brand", "model", "category", "gender", "size"];
async function rememberCorrections(d) {
  const before = current, manualBefore = before.manual || {};
  const fresh = [...edited].filter((f) => LEARN.includes(f) && !manualBefore[f]
    && before[f] && d[f] && String(before[f]).trim() !== String(d[f]).trim())
    .map((f) => ({ champ: f, agent: String(before[f]), vendeur: String(d[f]), titre: before.title || "" }));
  if (!fresh.length) return;
  cfg.corrections = [...(cfg.corrections || []), ...fresh].slice(-40);
  await store.saveSettings(cfg).catch(() => {});
}
async function save(quiet) {
  const d = formData();
  await rememberCorrections(d);
  current = await store.updateListing(current.id, d);
  edited.clear();
  renderLocks();
  if (!quiet) toast("Enregistré");
  refresh();
}
// Enregistrement automatique quand on ferme la fiche sans avoir cliqué sur « Enregistrer »
$("#editor").addEventListener("close", () => {
  if (isDirty()) guard(async () => { await save(true); toast("Modifications enregistrées"); });
});
const setStatus = (status, extra = {}) => guard(async () => {
  await save(true);
  current = await store.updateListing(current.id, { status, ...extra });
  await fillEditor(); refresh();
  toast(`Annonce « ${STATUS_LABEL[status]} »`);
});
function validate() {
  const d = formData(), missing = [];
  if (!d.title) missing.push("le titre");
  if (!d.description) missing.push("la description");
  if (!d.price) missing.push("le prix");
  if (!d.size) missing.push("la taille");
  if (!current.photos.length) missing.push("au moins une photo");
  if (missing.length) return toast(`Il manque ${missing.join(", ")} avant de valider.`, 6000);
  setStatus("prete");
}
async function markPublished() {
  const url = prompt("Lien de l'annonce Vinted (facultatif) :", current.vinted_url || "");
  if (url === null) return;
  setStatus("publiee", { vinted_url: url.trim() });
}

$("#btn-save").addEventListener("click", () => guard(() => save()));
$("#btn-delete").addEventListener("click", () => guard(async () => {
  if (!confirm("Supprimer définitivement cette annonce et ses photos ?")) return;
  await store.deleteListing(current);
  current = null; edited.clear(); // rien à enregistrer à la fermeture
  $("#editor").close(); refresh(); toast("Annonce supprimée");
}));

$("#btn-regen").addEventListener("click", (e) => runAgentInEditor(e.currentTarget));

document.querySelectorAll(".copy").forEach((b) => b.addEventListener("click", async () => {
  const d = formData();
  const text = b.dataset.copy === "title" ? d.title : [d.description, d.hashtags].filter(Boolean).join("\n\n");
  if (await copyText(text)) toast("Copié");
  else toast("Copie impossible ici, sélectionne le texte à la main");
}));

// Partage des photos (téléphone : « Enregistrer les images » ou envoyer vers une appli)
$("#btn-share").addEventListener("click", () => guard(async () => {
  toast("Préparation des photos…");
  const blobs = await Promise.all(current.photos.map(store.downloadPhoto));
  const files = blobs.map((b, i) => new File([b], `vinted-${current.id}-${i + 1}.jpg`, { type: "image/jpeg" }));
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); } catch { /* partage annulé */ }
    return;
  }
  // Ordinateur : téléchargement classique
  files.forEach((f) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  toast("Photos téléchargées");
}));

// ---------- marques ----------
function fillBrandOptions() {
  $("#brand-options").innerHTML = allBrands(cfg.brands || []).map((b) => `<option value="${esc(b.name)}">`).join("");
}
function renderBrands() {
  const q = $("#b-search").value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const onlyMine = $("#b-only-mine").checked;
  const list = allBrands(cfg.brands || []);
  const shown = list.filter((b) => (!onlyMine || b.custom)
    && (!q || b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)));
  const mine = list.filter((b) => b.custom).length;
  $("#brands-count").textContent = `${list.length} marques, dont ${mine} à toi`;
  $("#brand-list").innerHTML = shown.length ? shown.map((b) => `
    <li data-name="${esc(b.name)}">
      <div><b>${esc(b.name)}</b>${b.custom ? ' <span class="mine">à toi</span>' : ""}
        ${b.cues ? `<small>${esc(b.cues)}</small>` : ""}</div>
      ${b.custom ? `<button type="button" class="ghost small" data-del="${esc(b.name)}" title="Retirer">✕</button>` : ""}
    </li>`).join("")
    : `<li class="empty">Aucune marque trouvée. Ajoute-la au-dessus.</li>`;
}
async function saveBrands(brands, msg) {
  const next = { ...cfg, brands };
  await store.saveSettings(next);
  cfg = next; fillBrandOptions(); renderBrands(); toast(msg);
}
$("#btn-brands").addEventListener("click", () => {
  $("#b-search").value = ""; $("#b-name").value = ""; $("#b-cues").value = "";
  renderBrands(); $("#brands-dlg").showModal();
});
$("#b-search").addEventListener("input", renderBrands);
$("#b-only-mine").addEventListener("change", renderBrands);
// toucher une marque : la reprendre dans le formulaire pour ajouter ou corriger ses repères
$("#brand-list").addEventListener("click", (e) => guard(async () => {
  const del = e.target.closest("[data-del]");
  if (del) {
    const name = del.dataset.del;
    if (!confirm(`Retirer « ${name} » de tes marques ?`)) return;
    return saveBrands((cfg.brands || []).filter((b) => b.name !== name), "Marque retirée");
  }
  const li = e.target.closest("li[data-name]"); if (!li) return;
  const b = allBrands(cfg.brands || []).find((x) => x.name === li.dataset.name);
  $("#b-name").value = b.name; $("#b-cues").value = b.cues || "";
  $("#b-cues").focus();
}));
$("#btn-brand-save").addEventListener("click", () => guard(async () => {
  const name = $("#b-name").value.trim().replace(/\s+/g, " ");
  const cues = $("#b-cues").value.trim();
  if (!name) return toast("Écris le nom de la marque.");
  const key = (x) => x.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const brands = (cfg.brands || []).filter((b) => key(b.name) !== key(name));
  brands.push({ name, cues });
  await saveBrands(brands, `« ${name} » enregistrée${cues ? " avec ses repères" : ""}`);
  $("#b-name").value = ""; $("#b-cues").value = ""; $("#b-search").value = name; renderBrands();
}));

// ---------- extension Chrome ----------
let extensionReady = false;
const extWaiters = new Map();
window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== location.origin || e.data?.source !== "vinted-agent-extension") return;
  const d = e.data;
  if (d.type === "ready" && !extensionReady) {
    extensionReady = true;
    if (current) fillEditor();
    takePublished();
  }
  if (d.type === "publish-result") { extWaiters.get(d.requestId)?.(d); extWaiters.delete(d.requestId); }
  if (d.type === "published") applyPublished(d.published || []);
});
const toExtension = (msg) => window.postMessage({ source: "vinted-agent-app", ...msg }, location.origin);
toExtension({ type: "ping" });
function takePublished() { if (extensionReady) toExtension({ type: "takePublished" }); }
document.addEventListener("visibilitychange", () => { if (!document.hidden) takePublished(); });

// annonces publiées sur Vinted pendant que tu y étais : on les passe en « Publiée » avec le lien
async function applyPublished(list) {
  for (const p of list) {
    await guard(async () => {
      const L = await store.updateListing(p.id, { status: "publiee", vinted_url: p.url });
      if (current?.id === p.id) { current = L; await fillEditor(); }
      toast(`« ${L.title || "Annonce"} » publiée sur Vinted ✅`, 5000);
    });
  }
  if (list.length) refresh();
}

$("#btn-ext-publish").addEventListener("click", () => guard(async () => {
  await save(true);
  const c = current;
  const urls = await store.photoUrls(c.photos);
  const listing = {
    id: c.id, title: c.title, price: c.price, category: c.category, brand: c.brand, size: c.size,
    condition: c.condition, color: c.color,
    description: [c.description, c.hashtags].filter(Boolean).join("\n\n"),
    photoUrls: c.photos.map((p) => urls[p]).filter(Boolean),
  };
  const requestId = Math.random().toString(36).slice(2);
  const res = await new Promise((resolve) => {
    extWaiters.set(requestId, resolve);
    toExtension({ type: "publish", listing, requestId });
    setTimeout(() => resolve({ ok: false, error: "l'extension ne répond pas" }), 60000);
  });
  if (!res.ok) throw new Error(`Extension : ${res.error || "erreur"}`);
  toast(`Vinted s'ouvre et se remplit (${res.photos} photo${res.photos > 1 ? "s" : ""})… Vérifie puis clique sur « Ajouter ».`, 8000);
}));

// ---------- réglages ----------
const SET_FIELDS = ["groq_vision_model", "groq_text_model", "style", "marge_prix", "emojis", "tutoiement", "signature", "studio_style"];
const opts = (o) => Object.entries(o).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
$("#btn-settings").addEventListener("click", () => {
  $("#s-groq_vision_model").innerHTML = opts(VISION_MODELS);
  $("#s-groq_text_model").innerHTML = opts(TEXT_MODELS);
  SET_FIELDS.forEach((f) => { $(`#s-${f}`).value = String(cfg[f] ?? ""); });
  $("#s-hashtags").checked = cfg.hashtags !== false;
  $("#s-double_check").checked = cfg.double_check !== false;
  $("#s-studio_auto").checked = cfg.studio_auto !== false;
  $("#s-groq_api_key").value = "";
  $("#gkey-state").textContent = cfg.groq_api_key ? `configurée (…${cfg.groq_api_key.slice(-4)})` : "pas encore configurée";
  $("#settings").showModal();
});
$("#btn-set-save").addEventListener("click", () => guard(async () => {
  const next = { ...cfg };
  SET_FIELDS.forEach((f) => { next[f] = $(`#s-${f}`).value; });
  next.tutoiement = next.tutoiement === "true";
  next.hashtags = $("#s-hashtags").checked;
  next.double_check = $("#s-double_check").checked;
  next.studio_auto = $("#s-studio_auto").checked;
  const k = $("#s-groq_api_key").value.trim();
  if (k) next.groq_api_key = k;
  await store.saveSettings(next);
  cfg = next; $("#s-groq_api_key").value = "";
  $("#settings").close(); toast("Réglages enregistrés");
  if ($("#editor").open && current) renderAgentBox();
}));
$("#btn-logout").addEventListener("click", async () => {
  await store.signOut(); $("#settings").close(); items = []; start();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
start().catch((e) => toast(e.message, 7000));
