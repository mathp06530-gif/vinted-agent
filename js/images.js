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
