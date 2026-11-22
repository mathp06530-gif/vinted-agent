// Fait le lien entre l'appli Vinted Agent et la page Vinted.
// 1. L'appli envoie une annonce -> on la garde et on ouvre « Vendre un article ».
// 2. La page Vinted demande l'annonce en attente -> on lui donne (photos téléchargées ici).
// 3. Quand l'annonce est publiée sur Vinted -> on le note, l'appli le récupère et la passe en « Publiée ».

const NEW_ITEM_URL = "https://www.vinted.fr/items/new";

async function toDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`photo inaccessible (${r.status})`);
  const blob = await r.blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === "publish") {
      // on télécharge les photos tout de suite : les liens de l'appli expirent au bout d'une heure
      const photos = [];
      for (const u of msg.listing.photoUrls || []) {
        try { photos.push(await toDataUrl(u)); } catch { /* photo ignorée */ }
      }
      await chrome.storage.local.set({ pending: { ...msg.listing, photos, photoUrls: undefined, at: Date.now() } });
      const tab = await chrome.tabs.create({ url: NEW_ITEM_URL, active: true });
      await chrome.storage.local.set({ pendingTab: tab.id });
      reply({ ok: true, photos: photos.length });
    } else if (msg.type === "getPending") {
      const { pending } = await chrome.storage.local.get("pending");
      // une annonce en attente reste valable 2 heures
      reply({ pending: pending && Date.now() - pending.at < 2 * 3600e3 ? pending : null });
    } else if (msg.type === "filled") {
      const { pending } = await chrome.storage.local.get("pending");
      if (pending) await chrome.storage.local.set({ pending: { ...pending, filledAt: Date.now() } });
      reply({ ok: true });
    } else if (msg.type === "published") {
      const { pending, published = [] } = await chrome.storage.local.get(["pending", "published"]);
      if (pending?.filledAt && Date.now() - pending.filledAt < 2 * 3600e3) {
        published.push({ id: pending.id, url: msg.url, at: Date.now() });
        await chrome.storage.local.set({ published, pending: null });
      }
      reply({ ok: true });
    } else if (msg.type === "takePublished") {
      const { published = [] } = await chrome.storage.local.get("published");
      await chrome.storage.local.set({ published: [] });
      reply({ published });
    } else if (msg.type === "cancel") {
      await chrome.storage.local.set({ pending: null });
      reply({ ok: true });
    }
  })().catch((e) => reply({ ok: false, error: String(e?.message || e) }));
  return true; // réponse asynchrone
});
