// Relais gratuit Cloudflare pour Vinted Agent : génère une image de sol avec FLUX.1 schnell (Workers AI).
// Gratuit dans la limite quotidienne de Workers AI (10 000 « neurones » par jour).
// Protégé par un code secret (variable KEY) pour que personne d'autre n'utilise ton quota.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Key",
};
const json = (data, status = 200) => Response.json(data, { status, headers: CORS });

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "Utilise POST." }, 405);
    if (!env.KEY || request.headers.get("X-Key") !== env.KEY) return json({ error: "Code secret incorrect." }, 401);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Requête illisible." }, 400); }
    const prompt = String(body?.prompt || "").trim().slice(0, 2000);
    if (!prompt) return json({ error: "Décris le sol voulu." }, 400);

    try {
      const out = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
        prompt,
        steps: 8, // le maximum : meilleure qualité (le paramètre « seed » est refusé par le modèle)
      });
      if (!out?.image) return json({ error: "Pas d'image renvoyée par le modèle." }, 502);
      return json({ image: out.image }); // JPEG en base64
    } catch (e) {
      const msg = String(e?.message || e);
      // quota gratuit du jour épuisé
      if (/neuron|limit|quota|429/i.test(msg)) return json({ error: "Quota gratuit du jour atteint, réessaie demain." }, 429);
      return json({ error: msg.slice(0, 300) }, 500);
    }
  },
};
