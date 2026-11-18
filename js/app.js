import * as store from "./store.js";
import { generate, AgentError, VISION_MODELS, TEXT_MODELS } from "./agent.js";
import { toJpeg, blobToBase64 } from "./images.js";

const $ = (s) => document.querySelector(s);
const STATUS_LABEL = { brouillon: "À vérifier", prete: "Prête", publiee: "Publiée", vendue: "Vendue" };
const FIELDS = ["title", "description", "hashtags", "brand", "model", "category", "size", "condition", "color", "material", "price", "hints"];
const DEFAULT_SETTINGS = {
  groq_api_key: "", groq_vision_model: Object.keys(VISION_MODELS)[0], groq_text_model: "openai/gpt-oss-120b",
  tutoiement: true, emojis: "rare", hashtags: true, signature: "", style: "naturel", marge_prix: "normal",
};
let cfg = { ...DEFAULT_SETTINGS };
let items = [];
let current = null;
let tab = "brouillon";
let newFiles = [];

// ---------- petits outils ----------
function toast(msg, ms = 3500) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
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
  if (!user) { $("#btn-settings").hidden = true; $("#who").textContent = "Tes annonces, préparées pour toi"; return show("login"); }
  $("#who").textContent = user.email;
  $("#btn-settings").hidden = false;
  show("app");
  cfg = { ...DEFAULT_SETTINGS, ...(await guard(store.loadSettings)) };
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
    const n = b.dataset.s ? count(b.dataset.s) : items.length;
    b.innerHTML = b.textContent.replace(/\s*\d+$/, "") + `<span class="n">${n}</span>`;
  });

  const list = tab ? items.filter((i) => i.status === tab) : items;
  const covers = await guard(() => store.photoUrls(list.map((i) => i.photos[0]).filter(Boolean))) || {};
  $("#grid").innerHTML = list.length ? list.map((i) => `
    <button class="item" data-id="${i.id}">
      ${i.photos[0] && covers[i.photos[0]] ? `<img src="${covers[i.photos[0]]}" loading="lazy" alt="">` : `<img alt="">`}
      <div class="meta">
        <div class="t">${esc(i.title) || "<em>Sans titre</em>"}</div>
        <div class="p"><span class="price">${euro(i.price)}</span><span class="badge ${i.status}">${STATUS_LABEL[i.status]}</span></div>
      </div>
    </button>`).join("")
    : `<p class="empty">Rien ici pour l'instant.</p>`;
}
$("#grid").addEventListener("click", (e) => { const b = e.target.closest(".item"); if (b) openEditor(+b.dataset.id); });
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { tab = b.dataset.s; refresh(); } });
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#screen-app").hidden && !$("#editor").open) refresh(); });

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

async function uploadFiles(files, onProgress) {
  const paths = [], blobs = [];
  for (const [i, f] of [...files].entries()) {
    onProgress?.(`Envoi des photos ${i + 1}/${files.length}…`);
    const jpeg = await toJpeg(f);
    paths.push(await store.uploadPhoto(jpeg));
    blobs.push(jpeg);
  }
  return { paths, blobs };
}

async function runAgent(listing, blobs, extraHints, onStep) {
  if (!blobs) blobs = await Promise.all(listing.photos.map(store.downloadPhoto));
  const photosB64 = await Promise.all(blobs.map(blobToBase64));
  const fields = await generate({ key: cfg.groq_api_key, cfg, listing, photosB64, extraHints, onStep });
  return store.updateListing(listing.id, fields);
}

$("#btn-create").addEventListener("click", async () => {
  const files = newFiles, hints = $("#new-hints").value;
  busy(true, "Préparation des photos…");
  let item;
  try {
    const { paths, blobs } = await uploadFiles(files, (t) => busy(true, t));
    item = await store.createListing({ hints, photos: paths });
    newFiles = []; setNewFiles([]); $("#new-hints").value = "";
    try {
      item = await runAgent(item, blobs, "", (t) => busy(true, t));
      toast("Annonce prête à vérifier");
    } catch (e) { toast(e.message, 7000); }
    tab = "brouillon"; await refresh(); openEditor(item.id);
  } catch (e) { toast(e.message, 7000); }
  busy(false);
});

// ---------- éditeur ----------
async function openEditor(id) {
  current = await guard(() => store.getListing(id));
  if (!current) return;
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
  await renderPhotos();

  const [nl, nf, al, af, hint] = {
    brouillon: ["Valider l'annonce", () => setStatus("prete"), "", null,
      "Relis, corrige si besoin, puis valide : elle passe dans « Prêtes à publier »."],
    prete: ["Marquer publiée", markPublished, "Remettre à vérifier", () => setStatus("brouillon"), ""],
    publiee: ["Marquer vendue", () => setStatus("vendue"), "Remettre en « prête »", () => setStatus("prete"),
      c.vinted_url ? `En ligne : ${c.vinted_url}` : "En ligne sur Vinted."],
    vendue: ["Remettre en ligne", () => setStatus("publiee"), "", null, "Vendue 🎉"],
  }[c.status];
  $("#btn-next").textContent = nl; $("#btn-next").onclick = nf;
  $("#btn-alt").hidden = !al; $("#btn-alt").textContent = al; $("#btn-alt").onclick = af;
  $("#ed-hint").textContent = hint;
}

async function renderPhotos() {
  const ph = current.photos;
  const urls = await guard(() => store.photoUrls(ph)) || {};
  $("#ed-photos").innerHTML = ph.map((p, i) => `
    <div class="ph">
      ${i === 0 ? '<span class="cover">couverture</span>' : ""}
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
  if (b.dataset.del !== undefined) {
    if (!confirm("Retirer cette photo ?")) return;
    const [removed] = photos.splice(+b.dataset.del, 1);
    current = await store.updateListing(current.id, { photos });
    store.removePhoto(removed);
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

function formData() {
  const d = {};
  FIELDS.forEach((f) => { const el = $(`#f-${f}`); if (el) d[f] = el.value; });
  d.price = d.price === "" ? null : Number(d.price);
  return d;
}
async function save(quiet) {
  current = await store.updateListing(current.id, formData());
  if (!quiet) toast("Enregistré");
  refresh();
}
const setStatus = (status, extra = {}) => guard(async () => {
  await save(true);
  current = await store.updateListing(current.id, { status, ...extra });
  await fillEditor(); refresh();
  toast(`Annonce « ${STATUS_LABEL[status]} »`);
});
async function markPublished() {
  const url = prompt("Lien de l'annonce Vinted (facultatif) :", current.vinted_url || "");
  if (url === null) return;
  setStatus("publiee", { vinted_url: url.trim() });
}

$("#btn-save").addEventListener("click", () => guard(() => save()));
$("#btn-delete").addEventListener("click", () => guard(async () => {
  if (!confirm("Supprimer définitivement cette annonce et ses photos ?")) return;
  await store.deleteListing(current);
  $("#editor").close(); refresh(); toast("Annonce supprimée");
}));

$("#btn-regen").addEventListener("click", async () => {
  const btn = $("#btn-regen"), label = btn.textContent;
  btn.disabled = true;
  try {
    await save(true);
    current = await runAgent(current, null, $("#regen-hint").value, (t) => { btn.textContent = t; });
    $("#regen-hint").value = "";
    await fillEditor(); refresh(); toast("Nouvelle version");
  } catch (e) { toast(e.message, 7000); }
  btn.disabled = false; btn.textContent = label;
});

document.querySelectorAll(".copy").forEach((b) => b.addEventListener("click", async () => {
  const d = formData();
  const text = b.dataset.copy === "title" ? d.title : [d.description, d.hashtags].filter(Boolean).join("\n\n");
  try { await navigator.clipboard.writeText(text); toast("Copié"); }
  catch { toast("Copie impossible ici, sélectionne le texte à la main"); }
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

// ---------- réglages ----------
const SET_FIELDS = ["groq_vision_model", "groq_text_model", "style", "marge_prix", "emojis", "tutoiement", "signature"];
const opts = (o) => Object.entries(o).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
$("#btn-settings").addEventListener("click", () => {
  $("#s-groq_vision_model").innerHTML = opts(VISION_MODELS);
  $("#s-groq_text_model").innerHTML = opts(TEXT_MODELS);
  SET_FIELDS.forEach((f) => { $(`#s-${f}`).value = String(cfg[f] ?? ""); });
  $("#s-hashtags").checked = cfg.hashtags !== false;
  $("#s-groq_api_key").value = "";
  $("#gkey-state").textContent = cfg.groq_api_key ? `configurée (…${cfg.groq_api_key.slice(-4)})` : "pas encore configurée";
  $("#settings").showModal();
});
$("#btn-set-save").addEventListener("click", () => guard(async () => {
  const next = { ...cfg };
  SET_FIELDS.forEach((f) => { next[f] = $(`#s-${f}`).value; });
  next.tutoiement = next.tutoiement === "true";
  next.hashtags = $("#s-hashtags").checked;
  const k = $("#s-groq_api_key").value.trim();
  if (k) next.groq_api_key = k;
  await store.saveSettings(next);
  cfg = next; $("#s-groq_api_key").value = "";
  $("#settings").close(); toast("Réglages enregistrés");
}));
$("#btn-logout").addEventListener("click", async () => {
  await store.signOut(); $("#settings").close(); items = []; start();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
start().catch((e) => toast(e.message, 7000));
