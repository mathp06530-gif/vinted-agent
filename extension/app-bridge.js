// Sur la page de l'appli Vinted Agent : signale que l'extension est installée
// et transmet les demandes « Publier sur Vinted » à l'extension.
(() => {
  const ORIGIN = location.origin;
  const announce = () => window.postMessage({ source: "vinted-agent-extension", type: "ready", version: "1.0.0" }, ORIGIN);

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== ORIGIN || e.data?.source !== "vinted-agent-app") return;
    const { type, listing, requestId } = e.data;
    if (type === "ping") announce();
    if (type === "publish") {
      chrome.runtime.sendMessage({ type: "publish", listing }, (res) =>
        window.postMessage({ source: "vinted-agent-extension", type: "publish-result", requestId, ...res }, ORIGIN));
    }
    if (type === "takePublished") {
      chrome.runtime.sendMessage({ type: "takePublished" }, (res) =>
        window.postMessage({ source: "vinted-agent-extension", type: "published", published: res?.published || [] }, ORIGIN));
    }
  });
  announce();
  document.addEventListener("DOMContentLoaded", announce);
})();
