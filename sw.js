// Service worker minimal : rend l'appli installable sur l'écran d'accueil.
// Toujours le réseau d'abord (pour avoir la dernière version), le cache si pas de réseau.
const CACHE = "vinted-agent-v3";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }) // revalide toujours : pas de vieille version bloquée
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
