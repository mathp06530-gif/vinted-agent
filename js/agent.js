// L'agent : Qwen (vision) regarde les photos, GPT-OSS 120B écrit l'annonce. Tout passe par Groq.
import { SYSTEM, VISION_PROMPT } from "./prompts.js?v=12";
import { guideFor } from "./legit.js?v=12";
import { categoriesFor } from "./categories.js?v=12";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const VISION_MODELS = { "qwen/qwen3.8-27b": "Qwen 3.8 27B (vision)" };
export const TEXT_MODELS = {
  "openai/gpt-oss-120b": "GPT-OSS 120B (le plus fort)",
  "openai/gpt-oss-20b": "GPT-OSS 20B (plus rapide)",
};
export const ETATS = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
export const GENRES = ["Homme", "Femme", "Enfant", "Unisexe"];
// Champs que le vendeur peut imposer à l'agent en les saisissant à la main
export const LOCKABLE = ["gender", "size", "brand", "model", "category", "condition", "color", "material", "price"];
// Limite gratuite Groq : ~7000 tokens/minute pour le modèle vision, ~2000 par image.
// On envoie donc au plus 3 images (les photos en trop sont regroupées en planches avant).
export const MAX_IMAGES = 3;
const OBS_KEYS = '{"type_article":"","coupe":"","marque":"","modele_probable":"","textes_lus":[],"taille_lue":"","indices_genre":"",'
  + '"couleurs":"","matiere_lue":"","pays_fabrication":"","code_produit":"","etat_observe":"","defauts":[],'
  + '"details":[],"doutes":"","authenticite":"ok|douteux|impossible_a_dire","signaux_authenticite":[],"photo_a_ajouter":""}';

const S = { type: "string" };
const LS = { type: "array", items: { type: "string" } };
const strict = (name, props) => ({
  type: "json_schema",
  json_schema: {
    name, strict: true,
    schema: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false },
  },
});
const ANNONCE_FORMAT = strict("annonce", {
  titre: S, description: S, marque: S, modele: S, categorie: S, taille: S,
  genre: { type: "string", enum: GENRES },
  etat: { type: "string", enum: ETATS }, couleur: S, matiere: S,
  prix: { type: "integer" }, prix_min: { type: "integer" }, prix_max: { type: "integer" },
  hashtags: LS, notes_vendeur: S,
  alerte: { type: "string", enum: ["aucune", "douteux"] }, raison_alerte: S, photo_a_ajouter: S,
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
export async function generate({ key, cfg, listing, photosB64, extraHints = "", examples = [], onStep }) {
  if (!key) throw new AgentError("Ajoute ta clé Groq (gratuite, console.groq.com) dans Réglages pour activer l'agent.");
  if (!photosB64.length) throw new AgentError("Ajoute au moins une photo.");
  const visionModel = cfg.groq_vision_model || Object.keys(VISION_MODELS)[0];
  const textModel = cfg.groq_text_model || "openai/gpt-oss-120b";
  const hints = [listing.hints, extraHints].filter((h) => h && h.trim()).join("\n");

  // 1. L'œil regarde les photos (un seul envoi, 3 images max)
  onStep?.("L'agent regarde tes photos…");
  const content = [{ type: "text", text: VISION_PROMPT
    + "\n\nCertaines images peuvent être des planches qui regroupent plusieurs photos numérotées."
    + (hints ? `\n\nInfo du vendeur : ${hints}` : "")
    + `\n\nRéponds UNIQUEMENT avec un objet JSON qui a exactement ces clés :\n${OBS_KEYS}` }];
  photosB64.slice(0, MAX_IMAGES).forEach((b64) => {
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
  });
  const notes = [await groq(key, {
    model: visionModel, messages: [{ role: "user", content }],
    response_format: { type: "json_object" }, max_completion_tokens: 3000, temperature: 0.2,
  }, onStep)];

  // 2. Le rédacteur écrit l'annonce
  onStep?.("L'agent rédige l'annonce…");
  // Champs imposés par le vendeur : saisis à la création (genre, taille) ou modifiés à la main dans la fiche
  const manual = Object.fromEntries(Object.entries(listing.manual || {}).filter(([, v]) => v !== "" && v != null));
  const LABELS = { gender: "genre", size: "taille", brand: "marque", model: "modèle", category: "catégorie",
    condition: "état", color: "couleur", material: "matière", price: "prix" };
  let text ="Tu n'as pas les photos sous les yeux : un assistant les a regardées pour toi et a noté ce qu'il voit "
    + "(une fiche par paquet de photos). Fie-toi à ces notes, croise-les, et quand les fiches se contredisent, "
    + "prends la plus précise ou signale le doute dans notes_vendeur.\n\nNotes sur les photos :\n"
    + JSON.stringify(notes, null, 1) + "\n\nPrépare l'annonce Vinted pour cet article.\n\n"
    + `Infos du vendeur : ${hints || "(aucune, débrouille-toi avec les photos)"}\n`;
  if (Object.keys(manual).length) {
    text += "Infos données par le vendeur lui-même (elles font foi, reprends-les telles quelles) :\n"
      + Object.entries(manual).map(([k, v]) => `- ${LABELS[k] || k} : ${v}`).join("\n") + "\n";
  }
  text += `\nCatégories Vinted disponibles :\n${categoriesFor(manual.gender)}\n`;
  const brand = manual.brand || notes[0]?.marque || "";
  text += `\nGuide anti-contrefaçon (signaux à croiser avec les notes) :\n${guideFor(brand)}\n`;
  if (examples.length) {
    text += "\nPièces déjà vérifiées par le vendeur lui-même (apprends de ses verdicts, ils font foi) :\n"
      + examples.map((e) => `- ${e.title || e.brand || "pièce"} : ${e.authenticity === "fausse" ? "FAUSSE" : "AUTHENTIQUE"}`
        + (e.auth_reason ? `, parce que ${e.auth_reason}` : "")).join("\n") + "\n";
  }
  text += `\nPréférences d'écriture du vendeur :\n${styleInstructions(cfg)}\n`;
  text += `\nVariante d'écriture n°${1 + Math.floor(Math.random() * 999)} (change un peu ta formulation par rapport à d'habitude).`;

  const body = {
    model: textModel,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }],
    response_format: ANNONCE_FORMAT, max_completion_tokens: 6000, temperature: 0.8,
  };
  if (textModel.includes("gpt-oss")) body.reasoning_effort = "medium";
  const a = await groq(key, body, onStep);

  // « Inconnu », « Non visible »... = champ vide (le doute est dans les notes)
  for (const k of ["marque", "modele", "categorie", "taille", "couleur", "matiere"]) {
    if (/^\s*(inconnue?s?|non (visible|précisée?|identifiée?|indiquée?)|n\/?a|aucune?|-|\?)\s*$/i.test(a[k] || "")) a[k] = "";
  }
  // Filet de sécurité : jamais de « taille non indiquée » dans le texte public
  const noUnknown = (t) => String(t || "")
    .replace(/[,\s]*(taille|pointure|matière)\s+(non\s+(indiquée?|visible|précisée?)|inconnue?)/gi, "")
    .replace(/\s+([,.])/g, "$1");
  a.titre = noUnknown(a.titre);
  a.description = noUnknown(a.description);
  const tags = (a.hashtags || []).filter((t) => String(t).trim())
    .map((t) => "#" + String(t).toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, "")).join(" ");
  return {
    title: humanize(a.titre).slice(0, 100),
    description: humanize(a.description),
    brand: (a.marque || "").trim(),
    model: (a.modele || "").trim(),
    category: (a.categorie || "").trim(),
    gender: GENRES.includes(a.genre) ? a.genre : "",
    size: (a.taille || "").trim(),
    condition: ETATS.includes(a.etat) ? a.etat : "Bon état",
    color: (a.couleur || "").trim(),
    material: (a.matiere || "").trim(),
    price: a.prix,
    // ce que le vendeur a saisi à la main n'est jamais écrasé
    ...manual,
    price_min: a.prix_min,
    price_max: a.prix_max,
    hashtags: cfg.hashtags === false ? "" : tags,
    ai_notes: [a.notes_vendeur, a.photo_a_ajouter && `Photo utile à ajouter : ${a.photo_a_ajouter}`]
      .filter((x) => x && x.trim()).join("\n\n"),
    // Un verdict déjà donné par le vendeur n'est jamais écrasé par l'agent
    ...(["fausse", "authentique"].includes(listing.authenticity) ? {} : {
      authenticity: a.alerte === "douteux" ? "douteux" : "",
      auth_reason: a.alerte === "douteux" ? (a.raison_alerte || "").trim() : "",
    }),
  };
}
