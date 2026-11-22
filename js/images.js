// Préparation des photos dans le navigateur : bonne orientation, JPEG, taille raisonnable.
const MAX_SIDE = 1568;

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function toJpeg(file) {
  let img;
  try { img = await decode(file); }
  catch { throw new Error(`Photo illisible : ${file.name} (format non supporté par ce navigateur)`); }
  const w0 = img.width, h0 = img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.86));
}

export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// Regroupe les photos en au plus `max` images (planches numérotées) pour rester
// dans la limite gratuite de Groq tout en montrant toutes les photos à l'agent.
export async function makeSheets(blobs, max = 3) {
  if (blobs.length <= max) return Promise.all(blobs.map(blobToBase64));
  const groups = Array.from({ length: max }, () => []);
  blobs.forEach((b, i) => groups[Math.floor((i * max) / blobs.length)].push({ b, n: i + 1 }));
  const out = [];
  for (const g of groups) {
    const cols = Math.ceil(Math.sqrt(g.length)), rows = Math.ceil(g.length / cols);
    const tile = Math.floor(1568 / Math.max(cols, rows));
    const c = document.createElement("canvas");
    c.width = cols * tile; c.height = rows * tile;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    for (const [k, { b, n }] of g.entries()) {
      const img = await createImageBitmap(b);
      const s = Math.min(tile / img.width, tile / img.height);
      const w = img.width * s, h = img.height * s;
      const x = (k % cols) * tile + (tile - w) / 2, y = Math.floor(k / cols) * tile + (tile - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      img.close?.();
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect((k % cols) * tile + 6, Math.floor(k / cols) * tile + 6, 120, 44);
      ctx.fillStyle = "#fff"; ctx.font = "bold 30px sans-serif";
      ctx.fillText(`Photo ${n}`, (k % cols) * tile + 14, Math.floor(k / cols) * tile + 39);
    }
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
    out.push(await blobToBase64(blob));
  }
  return out;
}

// ---------- Fond studio ----------
// Détourage gratuit dans le navigateur (@imgly/background-removal, modèle téléchargé une fois puis gardé en cache),
// puis mise en scène : fond clair dégradé, vêtement centré, ombre douce. Résultat au format 4:5 comme Vinted.
const BG_LIB = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";
let bgLib = null;
async function loadBgLib() {
  if (!bgLib) bgLib = await import(BG_LIB);
  return bgLib;
}

/** Zone occupée par le vêtement (pixels non transparents), calculée sur une version réduite. */
function contentBox(img) {
  const s = Math.min(1, 400 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null; // rien de détouré
  return { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s, coverage: ((x1 - x0) * (y1 - y0)) / (w * h) };
}

export const STUDIO_STYLES = {
  blanc: { label: "Blanc studio", top: "#ffffff", bottom: "#ececea" },
  gris: { label: "Gris clair", top: "#f4f4f3", bottom: "#d9d9d6" },
  beige: { label: "Beige doux", top: "#faf6f0", bottom: "#e8dfd2" },
};

/**
 * Transforme une photo en photo « studio ».
 * onProgress(texte) pour afficher l'avancement. Lance une erreur si rien n'a pu être détouré.
 */
export async function studioPhoto(blob, { style = "blanc", onProgress } = {}) {
  const { removeBackground } = await loadBgLib();
  let lastPct = -1;
  const cut = await removeBackground(blob, {
    output: { format: "image/png" },
    progress: (key, cur, total) => {
      if (!key.startsWith("fetch")) return;
      const pct = Math.round((100 * cur) / (total || 1));
      if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; onProgress?.(`Téléchargement du détoureur (une seule fois)… ${pct} %`); }
    },
  });
  const img = await createImageBitmap(cut);
  const box = contentBox(img);
  if (!box || box.coverage < 0.02) { img.close?.(); throw new Error("Le vêtement n'a pas pu être détouré sur cette photo."); }

  const W = 1200, H = 1500; // format portrait 4:5
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const st = STUDIO_STYLES[style] || STUDIO_STYLES.blanc;
  // fond : dégradé vertical + léger vignettage, comme un fond papier de studio
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, st.top); g.addColorStop(0.62, st.top); g.addColorStop(1, st.bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.45, W * 0.3, W / 2, H * 0.5, W * 0.95);
  v.addColorStop(0, "rgba(255,255,255,0)"); v.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);

  // vêtement : 82 % de la place, centré, posé un peu au-dessus du bas
  const scale = Math.min((W * 0.82) / box.w, (H * 0.8) / box.h);
  const dw = box.w * scale, dh = box.h * scale;
  const dx = (W - dw) / 2, dy = (H - dh) / 2 - H * 0.01;
  // ombre au sol : ellipse floue sous le vêtement
  ctx.save();
  ctx.filter = "blur(18px)";
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.ellipse(W / 2, dy + dh + 10, dw * 0.42, Math.max(14, dh * 0.035), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // ombre portée douce qui suit la forme du vêtement
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)"; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14;
  ctx.drawImage(img, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
  ctx.restore();
  img.close?.();
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
}
