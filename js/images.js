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
