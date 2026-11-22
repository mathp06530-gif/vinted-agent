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
  // fond clair + sol gris-beige doux (béton ciré clair) : va avec toutes les couleurs
  sol: { label: "Sol gris-beige", floor: true, wall: [241, 239, 235], floorFar: [214, 209, 202], floorNear: [200, 195, 187] },
  // fonds plats sans sol
  blanc: { label: "Blanc", top: [250, 250, 249], bottom: [234, 234, 232] },
  gris: { label: "Gris clair", top: [243, 243, 242], bottom: [214, 214, 211] },
  beige: { label: "Beige doux", top: [250, 246, 240], bottom: [231, 222, 209] },
};

/** Bords propres : supprime le halo semi-transparent laissé par le détourage. */
function cleanEdges(data) {
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    // les zones à moitié transparentes sont des restes de fond (cintre flou, ombre du sol) : on les retire
    // (seuil modéré : sur un vêtement clair, le détoureur est moins sûr et laisse des zones à moitié transparentes
    //  qui font bien partie du vêtement ; les résidus isolés sont retirés ensuite par keepMainParts)
    if (a < 36) data[i] = 0;
    else if (a > 200) data[i] = 255;
    else { const t = (a - 36) / 164; data[i] = Math.round(255 * Math.min(1, t * 1.25)); }
  }
}

/** Ne garde que le vêtement : supprime les petits morceaux détachés (bout de cintre, étiquette volante, poussière). */
function keepMainParts(data, w, h) {
  const step = 3; // travail sur une grille réduite pour aller vite
  const gw = Math.ceil(w / step), gh = Math.ceil(h / step);
  const solid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = Math.min(w - 1, gx * step), y = Math.min(h - 1, gy * step);
    solid[gy * gw + gx] = data[(y * w + x) * 4 + 3] > 0 ? 1 : 0; // tout ce qui reste après le nettoyage des bords
  }
  const label = new Int32Array(gw * gh).fill(-1);
  const sizes = [];
  const stack = [];
  for (let i = 0; i < solid.length; i++) {
    if (!solid[i] || label[i] !== -1) continue;
    const id = sizes.length; let n = 0;
    stack.push(i); label[i] = id;
    while (stack.length) {
      const k = stack.pop(); n++;
      const x = k % gw, y = (k - x) / gw;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const j = ny * gw + nx;
        if (solid[j] && label[j] === -1) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(n);
  }
  if (sizes.length < 2) return;
  const biggest = Math.max(...sizes);
  const keep = sizes.map((n) => n >= biggest * 0.04); // une paire de chaussures = 2 grands morceaux, gardés
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const id = label[Math.min(gh - 1, Math.floor(y / step)) * gw + Math.min(gw - 1, Math.floor(x / step))];
    if (id !== -1 && !keep[id]) data[(y * w + x) * 4 + 3] = 0;
  }
}

/** Retouche automatique du vêtement : niveaux, contraste doux, un peu de couleur. */
function enhance(data) {
  // histogramme de luminosité sur les pixels du vêtement seulement
  const hist = new Uint32Array(256); let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    hist[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++; n++;
  }
  if (!n) return;
  const pick = (q) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * q) return v; } return 255; };
  let lo = pick(0.005), hi = pick(0.995);
  // on n'étire pas trop : un vêtement noir doit rester noir, un blanc rester blanc
  lo = Math.min(lo, 40); hi = Math.max(hi, 215);
  const scale = 255 / Math.max(1, hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let x = Math.min(1, Math.max(0, ((v - lo) * scale) / 255));
    x = x + 0.5 * (x - x * x) * (2 * x - 1); // contraste en S léger (assombrit un peu les ombres, éclaircit les lumières)
    x = Math.pow(x, 0.94); // un peu plus lumineux
    lut[v] = Math.round(255 * Math.min(1, Math.max(0, x)));
  }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = lut[data[i]], g = lut[data[i + 1]], b = lut[data[i + 2]];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * 1.08; g = l + (g - l) * 1.08; b = l + (b - l) * 1.08; // +8 % de couleur
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}

/** Netteté (masque flou) : rend les textures et les logos plus nets. */
function sharpen(ctx, w, h, amount = 0.45) {
  const src = ctx.getImageData(0, 0, w, h), d = src.data;
  const out = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 250) continue; // pas sur les bords détourés
      for (let c = 0; c < 3; c++) {
        const blur = (d[i - 4 + c] + d[i + 4 + c] + d[i - w * 4 + c] + d[i + w * 4 + c]) / 4;
        out[i + c] = d[i + c] + amount * (d[i + c] - blur);
      }
    }
  }
  src.data.set(out);
  ctx.putImageData(src, 0, 0);
}

/** Luminosité moyenne du vêtement (0 = noir, 255 = blanc). */
function meanLight(data) {
  let s = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) { // un pixel sur 4 suffit
    if (data[i + 3] < 200) continue;
    s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++;
  }
  return n ? s / n : 128;
}

/** Fond plat (dégradé + lumière douce). */
function drawFlat(ctx, W, H, st) {
  const rgb = (a) => `rgb(${a.join(",")})`;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(st.top)); g.addColorStop(0.55, rgb(st.top)); g.addColorStop(1, rgb(st.bottom));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const light = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.75);
  light.addColorStop(0, "rgba(255,255,255,0.55)"); light.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = light; ctx.fillRect(0, 0, W, H);
}

/**
 * Fond clair + sol neutre, sans murs ni perspective : la limite mur/sol est douce (comme un fond papier qui
 * descend jusqu'au sol), le sol est un peu plus foncé devant, avec une texture très fine de béton ciré.
 */
function drawFloor(ctx, W, H, st) {
  const rgb = (a) => `rgb(${a.join(",")})`;
  const horizon = H * 0.6;
  // mur clair, avec une lumière douce au centre
  const gw = ctx.createLinearGradient(0, 0, 0, horizon);
  gw.addColorStop(0, rgb(st.wall.map((v) => v - 6))); gw.addColorStop(1, rgb(st.wall));
  ctx.fillStyle = gw; ctx.fillRect(0, 0, W, horizon + 2);
  // sol : transition douce depuis le mur, plus foncé vers l'avant
  const gf = ctx.createLinearGradient(0, horizon - H * 0.05, 0, H);
  gf.addColorStop(0, rgb(st.wall)); gf.addColorStop(0.18, rgb(st.floorFar)); gf.addColorStop(1, rgb(st.floorNear));
  ctx.fillStyle = gf; ctx.fillRect(0, horizon - H * 0.05, W, H - horizon + H * 0.05);
  // lumière douce sur le mur et flaque de lumière au sol sous l'article
  const spot = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.7);
  spot.addColorStop(0, "rgba(255,255,255,0.35)"); spot.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H);
  const pool = ctx.createRadialGradient(W / 2, H * 0.86, 0, W / 2, H * 0.86, W * 0.6);
  pool.addColorStop(0, "rgba(255,255,255,0.18)"); pool.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = pool; ctx.fillRect(0, horizon, W, H - horizon);
  // texture fine du sol (béton ciré) + léger grain sur le mur
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    const onFloor = y > horizon;
    const amp = onFloor ? 7 : 2.5;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // grain + très légères marbrures sur le sol
      const n = (Math.random() - 0.5) * amp + (onFloor ? Math.sin(x * 0.013 + y * 0.004) * Math.sin(y * 0.021 - x * 0.006) * 2.2 : 0);
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
  }
  ctx.putImageData(img, 0, 0);
  // vignettage très léger
  const v = ctx.createRadialGradient(W / 2, H * 0.55, W * 0.5, W / 2, H * 0.55, W * 1.1);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.08)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

/** Base de l'article : où il touche le sol (pour placer l'ombre de contact au bon endroit). */
function bottomProfile(canvas) {
  const w = canvas.width, h = canvas.height;
  const band = Math.max(3, Math.round(h * 0.06));
  const { data } = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, h - band, w, band);
  let x0 = w, x1 = -1;
  for (let y = 0; y < band; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 140) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  return x1 < 0 ? { x: w * 0.2, w: w * 0.6 } : { x: x0, w: x1 - x0 };
}

/** Silhouette noire du vêtement (pour les ombres). */
function silhouette(canvas) {
  const s = document.createElement("canvas"); s.width = canvas.width; s.height = canvas.height;
  const x = s.getContext("2d");
  x.drawImage(canvas, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = "#000"; x.fillRect(0, 0, s.width, s.height);
  return s;
}

/**
 * Transforme une photo en photo « studio » : détourage, bords propres, retouche, cadrage, fond papier, ombres réalistes.
 * onProgress(texte) pour afficher l'avancement. Lance une erreur si rien n'a pu être détouré.
 */
export async function studioPhoto(blob, { style = "sol", onProgress } = {}) {
  const { removeBackground } = await loadBgLib();
  let lastPct = -1;
  const cut = await removeBackground(blob, {
    output: { format: "image/png", quality: 1 },
    progress: (key, cur, total) => {
      if (!key.startsWith("fetch")) return;
      const pct = Math.round((100 * cur) / (total || 1));
      if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; onProgress?.(`Téléchargement du détoureur (une seule fois)… ${pct} %`); }
    },
  });
  const img = await createImageBitmap(cut);
  const box = contentBox(img);
  if (!box || box.coverage < 0.02) { img.close?.(); throw new Error("Le vêtement n'a pas pu être détouré sur cette photo."); }

  // 1. vêtement recadré, bords nettoyés, retouché
  const pad = 2;
  const iw = Math.round(box.w) + pad * 2, ih = Math.round(box.h) + pad * 2;
  const item = document.createElement("canvas"); item.width = iw; item.height = ih;
  const ictx = item.getContext("2d", { willReadFrequently: true });
  ictx.drawImage(img, box.x - pad, box.y - pad, iw, ih, 0, 0, iw, ih);
  img.close?.();
  const px = ictx.getImageData(0, 0, iw, ih);
  cleanEdges(px.data);
  keepMainParts(px.data, iw, ih);
  enhance(px.data);
  ictx.putImageData(px, 0, 0);

  const W = 1200, H = 1500;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  let st = STUDIO_STYLES[style] || STUDIO_STYLES.sol; // (anciens réglages « studio » -> sol)
  // fond plat blanc + vêtement très clair : il disparaîtrait -> gris clair
  if (st === STUDIO_STYLES.blanc && meanLight(px.data) > 170) st = STUDIO_STYLES.gris;
  if (st.floor) drawFloor(ctx, W, H, st); else drawFlat(ctx, W, H, st);

  // 2. taille et position : dans la pièce, l'article est POSÉ sur le sol (sa base touche le sol)
  const floorY = Math.round(H * 0.87); // l'article est posé ici
  const maxW = W * (st.floor ? 0.8 : 0.86), maxH = st.floor ? floorY - H * 0.08 : H * 0.82;
  const scale = Math.min(maxW / iw, maxH / ih);
  const dw = Math.round(iw * scale), dh = Math.round(ih * scale);
  const sized = document.createElement("canvas"); sized.width = dw; sized.height = dh;
  const sctx = sized.getContext("2d", { willReadFrequently: true });
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(item, 0, 0, dw, dh);
  sharpen(sctx, dw, dh);
  const dx = Math.round((W - dw) / 2);
  const dy = st.floor ? floorY - dh : Math.round((H - dh) / 2);

  // 3. ombres sur le sol
  const sil = silhouette(sized);
  const base = bottomProfile(sized); // où l'article touche vraiment le sol (gauche/droite de sa base)
  // ombre portée vers l'arrière, aplatie sur le sol (lumière venant de face, un peu en hauteur)
  ctx.save(); ctx.globalAlpha = st.floor ? 0.22 : 0.14; ctx.filter = "blur(22px)";
  // la base de l'ombre colle à la base de l'article, le haut part vers l'arrière (vers le mur)
  ctx.setTransform(1, 0, -0.18, 0.22, dx + dh * 0.18, dy + dh - dh * 0.22);
  ctx.drawImage(sil, 0, 0);
  ctx.restore();
  // ombre de contact : bande sombre et nette exactement sous la base
  ctx.save(); ctx.globalAlpha = st.floor ? 0.5 : 0.35; ctx.filter = "blur(7px)";
  ctx.fillStyle = "#000";
  const cx = dx + base.x, cw = Math.max(20, base.w);
  ctx.beginPath(); ctx.ellipse(cx + cw / 2, dy + dh - 2, cw / 2 * 1.02, Math.max(6, dh * 0.012), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // ombre douce large (lumière d'ambiance)
  ctx.save(); ctx.globalAlpha = st.floor ? 0.22 : 0.12; ctx.filter = "blur(30px)";
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(cx + cw / 2, dy + dh + 4, cw * 0.62, Math.max(14, dh * 0.035), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 4. l'article
  ctx.drawImage(sized, dx, dy);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
}
