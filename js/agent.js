// L'agent : Qwen (vision) regarde les photos, GPT-OSS 120B écrit l'annonce. Tout passe par Groq.
import { SYSTEM, VISION_PROMPT } from "./prompts.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const VISION_MODELS = { "qwen/qwen3.8-27b": "Qwen 3.8 27B (vision)" };
export const TEXT_MODELS = {
  "openai/gpt-oss-120b": "GPT-OSS 120B (le plus fort)",
  "openai/gpt-oss-20b": "GPT-OSS 20B (plus rapide)",
};
export const ETATS = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
const IMAGES_PER_CALL = 3;
const MAX_PHOTOS = 9;

const S = { type: "string" };
const LS = { type: "array", items: { type: "string" } };
const strict = (name, props) => ({
  type: "json_schema",
  json_schema: {
    name, strict: true,
    schema: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false },
  },
});
const OBS_FORMAT = strict("observations", {
  type_article: S, marque: S, modele_probable: S, textes_lus: LS, taille_lue: S, couleurs: S,
  matiere_lue: S, etat_observe: S, defauts: LS, details: LS, doutes: S,
});
const ANNONCE_FORMAT = strict("annonce", {
  titre: S, description: S, marque: S, modele: S, categorie: S, taille: S,
  etat: { type: "string", enum: ETATS }, couleur: S, matiere: S,
  prix: { type: "integer" }, prix_min: { type: "integer" }, prix_max: { type: "integer" },
  hashtags: LS, notes_vendeur: S,
});

export class AgentError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function groq(key, body, onWait) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let r;
    try {
      r = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AgentError("Pas de connexion à Groq. Vérifie ta connexion internet.");
    }
    if (r.status === 429) {
      const h = r.headers.get("retry-after");
      const wait = Math.min(60, h !== null && !isNaN(+h) ? Math.ceil(+h) : 15);
      if (attempt === 3) throw new AgentError("Limite gratuite Groq atteinte pour le moment. Réessaie dans une minute.");
      onWait?.(`Limite Groq, on attend ${wait} s…`);
      await sleep(wait * 1000);
      continue;
    }
    if (r.status === 401) throw new AgentError("Clé Groq refusée. Vérifie-la dans Réglages.");
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new AgentError(`Erreur Groq (${r.status}) : ${data?.error?.message || "inconnue"}`);
    try {
      return JSON.parse(data.choices[0].message.content);
    } catch {
      if (attempt === 3) throw new AgentError("Réponse illisible du modèle, relance la génération.");
    }
  }
}

function styleInstructions(cfg) {
  const l = [];
  l.push(cfg.tutoiement !== false ? "Tutoie l'acheteur si tu t'adresses à lui." : "Vouvoie l'acheteur si tu t'adresses à lui.");
  const e = cfg.emojis || "rare";
  l.push(e === "jamais" ? "Aucun emoji."
    : e === "rare" ? "Au maximum un emoji simple, et seulement si ça vient naturellement (souvent aucun)."
    : "Un ou deux emojis simples autorisés, pas plus.");
  if (cfg.style === "court") l.push("Fais très court : 2-3 lignes max.");
  if (cfg.style === "detaille") l.push("Tu peux être un peu plus détaillé (matière, coupe, mesures si fournies), sans jamais tomber dans le marketing.");
  if (cfg.marge_prix === "vente_rapide") l.push("Le vendeur veut vendre vite : prix conseillé dans le bas de la fourchette du marché.");
  if (cfg.marge_prix === "haut") l.push("Le vendeur n'est pas pressé : prix conseillé dans le haut de la fourchette du marché.");
  if (cfg.signature) l.push(`Le vendeur aime finir ses annonces avec cette info (reformule-la librement, pas forcément mot pour mot) : « ${cfg.signature} »`);
  if (cfg.hashtags === false) l.push("Renvoie une liste de hashtags vide.");
  return l.map((x) => `- ${x}`).join("\n");
}

export function humanize(t) {
  return String(t || "")
    .replaceAll("**", "").replaceAll("__", "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/^#+\s*/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * photosB64 : photos en base64 (JPEG). listing : l'annonce actuelle.
 * Renvoie les champs à enregistrer.
 */
export async function generate({ key, cfg, listing, photosB64, extraHints = "", onStep }) {
  if (!key) throw new AgentError("Ajoute ta clé Groq (gratuite, console.groq.com) dans Réglages pour activer l'agent.");
  if (!photosB64.length) throw new AgentError("Ajoute au moins une photo.");
  const visionModel = cfg.groq_vision_model || Object.keys(VISION_MODELS)[0];
  const textModel = cfg.groq_text_model || "openai/gpt-oss-120b";
  const hints = [listing.hints, extraHints].filter((h) => h && h.trim()).join("\n");

  // 1. L'œil regarde les photos par paquets de 3
  const photos = photosB64.slice(0, MAX_PHOTOS);
  const notes = [];
  for (let s = 0; s < photos.length; s += IMAGES_PER_CALL) {
    onStep?.(`L'agent regarde les photos ${s + 1} à ${Math.min(s + IMAGES_PER_CALL, photos.length)}…`);
    const content = [{ type: "text", text: VISION_PROMPT + (hints ? `\n\nInfo du vendeur : ${hints}` : "") }];
    photos.slice(s, s + IMAGES_PER_CALL).forEach((b64, i) => {
      content.push({ type: "text", text: `Photo ${s + i + 1} :` });
      content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
    });
    notes.push(await groq(key, {
      model: visionModel, messages: [{ role: "user", content }],
      response_format: OBS_FORMAT, max_completion_tokens: 2000, temperature: 0.2,
    }, onStep));
  }

  // 2. Le rédacteur écrit l'annonce
  onStep?.("L'agent rédige l'annonce…");
  const already = Object.fromEntries(
    ["brand", "model", "size", "condition", "price"].filter((k) => listing[k]).map((k) => [k, listing[k]]));
  let text = "Tu n'as pas les photos sous les yeux : un assistant les a regardées pour toi et a noté ce qu'il voit "
    + "(une fiche par paquet de photos). Fie-toi à ces notes, croise-les, et quand les fiches se contredisent, "
    + "prends la plus précise ou signale le doute dans notes_vendeur.\n\nNotes sur les photos :\n"
    + JSON.stringify(notes, null, 1) + "\n\nPrépare l'annonce Vinted pour cet article.\n\n"
    + `Infos du vendeur : ${hints || "(aucune, débrouille-toi avec les photos)"}\n`;
  if (Object.keys(already).length) text += `Champs déjà renseignés par le vendeur (à respecter) : ${JSON.stringify(already)}\n`;
  text += `\nPréférences d'écriture du vendeur :\n${styleInstructions(cfg)}\n`;
  text += `\nVariante d'écriture n°${1 + Math.floor(Math.random() * 999)} (change un peu ta formulation par rapport à d'habitude).`;

  const body = {
    model: textModel,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }],
    response_format: ANNONCE_FORMAT, max_completion_tokens: 6000, temperature: 0.8,
  };
  if (textModel.includes("gpt-oss")) body.reasoning_effort = "medium";
  const a = await groq(key, body, onStep);

  const tags = (a.hashtags || []).filter((t) => String(t).trim())
    .map((t) => "#" + String(t).toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "")).join(" ");
  return {
    title: humanize(a.titre).slice(0, 100),
    description: humanize(a.description),
    brand: (a.marque || "").trim(),
    model: (a.modele || "").trim(),
    category: (a.categorie || "").trim(),
    size: listing.size || (a.taille || "").trim(),
    condition: ETATS.includes(a.etat) ? a.etat : "Bon état",
    color: (a.couleur || "").trim(),
    material: (a.matiere || "").trim(),
    price: listing.price || a.prix,
    price_min: a.prix_min,
    price_max: a.prix_max,
    hashtags: cfg.hashtags === false ? "" : tags,
    ai_notes: (a.notes_vendeur || "").trim(),
  };
}
