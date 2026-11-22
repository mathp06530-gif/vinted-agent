// L'agent : Qwen (vision) regarde les photos, GPT-OSS 120B écrit l'annonce. Tout passe par Groq.
import { SYSTEM, VISION_PROMPT } from "./prompts.js?v=28";
import { guideFor } from "./legit.js?v=28";
import { categoriesFor } from "./categories.js?v=28";
import { modelsFor } from "./models.js?v=28";
import { allBrands, matchBrand } from "./brands.js?v=28";
import { lexiqueFor, stripForbidden } from "./lexique.js?v=28";

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
const OBS_KEYS = '{"type_article":"","coupe":"","marque":"","preuve_marque":"texte lu|logo|aucune","modele_probable":"","textes_lus":[],"taille_lue":"","indices_genre":"",'
  + '"couleurs":"","matiere_lue":"","pays_fabrication":"","code_produit":"","etat_observe":"","defauts":[],'
  + '"details":[],"doutes":"","authenticite":"ok|douteux|impossible_a_dire","signaux_authenticite":[],"photo_a_ajouter":""}';

const CONF = ["haute", "moyenne", "basse"];
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
  confiance_marque: { type: "string", enum: CONF }, confiance_modele: { type: "string", enum: CONF },
  confiance_type: { type: "string", enum: CONF }, confiance_taille: { type: "string", enum: CONF },
});

export class AgentError extends Error {}

// Relecteur : modèle rapide, limite gratuite séparée de celle du rédacteur
const REVIEW_MODEL = "openai/gpt-oss-20b";
const REVIEW_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "relecture", strict: true,
    schema: {
      type: "object",
      properties: { titre: { type: "string" }, description: { type: "string" }, corrections: { type: "array", items: { type: "string" } } },
      required: ["titre", "description", "corrections"], additionalProperties: false,
    },
  },
};
const REVIEW_PROMPT = `Tu es le relecteur d'un vendeur Vinted français. On te donne les notes prises en regardant les photos, les infos du vendeur, et une annonce rédigée. Ton travail : rendre l'annonce 100 % vraie et naturelle.

Règles :
1. Chaque affirmation de la description doit être prouvée par les notes sur les photos ou par les infos du vendeur. Sinon, SUPPRIME-LA. En particulier : nombre de portés, confort, « taille bien », matière ou composition non lue sur une étiquette, technologie (imperméable, respirant, UV...), défaut absent des notes, accessoire (boîte, étiquettes) non mentionné.
2. Remplace tout mot bizarre, médical ou faux par le mot que dirait un vrai vendeur, en utilisant le lexique fourni (ex. des petits trous d'aération ou des points d'usure ne sont PAS des « piqûres d'aiguille » : dis « traces » ou « petite usure » ; une semelle « blessée » n'existe pas).
3. Tu peux SEULEMENT supprimer ou remplacer des mots. Tu n'ajoutes JAMAIS d'information, de détail, de couleur ou de logo, même s'ils sont vrais : ta version doit être aussi courte ou plus courte que l'originale. Garde le ton et la structure : phrases simples de particulier. Ne supprime pas un vrai défaut présent dans les notes.
3b. Si la description ressemble à une fiche technique (liste de couleurs, liste de logos, énumération de détails), raccourcis-la aux 2 ou 3 infos utiles à un acheteur.
4. Pas de tiret long, pas de gras, pas de hashtags dans la description. La description ne parle pas des photos manquantes.
5. Titre : marque + type + modèle si prouvé + taille ou couleur, sans « Homme »/« Femme ». Corrige-le seulement s'il contient une erreur.
6. corrections : liste courte de ce que tu as changé (ex. « retiré : portées 2 fois (non prouvé) », « piqûres d'aiguille -> traces »). Liste vide si tout était juste.`;
// Repères sans équivoque : si l'œil les a lus ou vus, la marque est forcément celle-ci
const BRAND_SIGNATURES = [
  ["Nike", /\b(tn|tuned|air ?max|swoosh|virgule nike|just do it|nike)\b/],
  ["Jordan", /\b(jumpman|air jordan)\b/],
  ["Adidas", /\b(adidas|tr[eè]fle|trefoil|samba|gazelle|stan smith|superstar)\b/],
  ["New Balance", /\bnew balance\b/],
  ["The North Face", /\bnorth face\b/],
  ["Reebok", /\breebok\b/],
  ["Puma", /\b(puma|formstrip)\b/],
  ["Lacoste", /\b(lacoste|logo crocodile)\b/],
  ["Ralph Lauren", /\b(ralph lauren|polo pony|joueur de polo)\b/],
  ["Converse", /\b(converse|chuck taylor)\b/],
  ["Vans", /\b(vans|jazz stripe|off the wall)\b/],
  ["Carhartt", /\bcarhartt\b/],
  ["Levi's", /\blevi'?s\b/],
  ["Stone Island", /\bstone island\b/],
  ["Moncler", /\bmoncler\b/],
  ["Tommy Hilfiger", /\btommy hilfiger\b/],
  // (pas de mots courants comme « champion » ou « all star » : ils apparaissent aussi dans des imprimés)
];
// Dernières notes de l'« œil » (pour comprendre une erreur)
export let lastVision = null;
export let lastVision2 = null;
// Consigne courte de la 2e lecture (peu de texte = assez de place pour les images dans la limite gratuite)
const SECOND_PROMPT = "Deuxième vérification, sois très rigoureux. Réponds UNIQUEMENT avec ce JSON : "
  + '{"marque":"","preuve_marque":"texte lu|logo|aucune","textes_lus":[],"modele":"","type_article":"","taille_lue":""}. '
  + "textes_lus : recopie exactement tout texte lisible (étiquettes, semelle, imprimés). "
  + "marque : seulement si tu LIS son nom ou vois un logo précis, sinon vide (ne devine jamais d'après le style). "
  + "modele : seulement si un nom, un logo de modèle ou une silhouette iconique le prouve. taille_lue : exactement comme écrite.";

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
      // Groq dit combien de temps attendre : en-tête retry-after, ou « try again in 7.25s / 1m2.5s » dans le message
      const h = r.headers.get("retry-after");
      const msg = (await r.json().catch(() => ({})))?.error?.message || "";
      const m = msg.match(/try again in (?:(\d+)m)?([\d.]+)s/i);
      const fromMsg = m ? (Number(m[1] || 0) * 60 + Number(m[2])) : NaN;
      const raw = !isNaN(fromMsg) ? fromMsg : (h !== null && !isNaN(+h) ? +h : 15);
      const wait = Math.min(60, Math.max(1, Math.ceil(raw + 0.5)));
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
export async function generate({ key, cfg, listing, photosB64, labelCount = 0, extraHints = "", examples = [], corrections = [], onStep }) {
  if (!key) throw new AgentError("Ajoute ta clé Groq (gratuite, console.groq.com) dans Réglages pour activer l'agent.");
  if (!photosB64.length) throw new AgentError("Ajoute au moins une photo.");
  const visionModel = cfg.groq_vision_model || Object.keys(VISION_MODELS)[0];
  const textModel = cfg.groq_text_model || "openai/gpt-oss-120b";
  const hints = [listing.hints, extraHints].filter((h) => h && h.trim()).join("\n");

  // 1. L'œil regarde les photos (un seul envoi, 3 images max)
  onStep?.("L'agent regarde tes photos…");
  const content = [{ type: "text", text: VISION_PROMPT
    + (labelCount ? `\n\nLa ou les ${labelCount} première(s) image(s) sont des GROS PLANS D'ÉTIQUETTE : lis chaque caractère avec soin (marque, taille, code produit, composition, Made in) et recopie-les dans textes_lus.` : "")
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
  lastVision = notes[0];

  // 2. Le rédacteur écrit l'annonce
  onStep?.("L'agent rédige l'annonce…");
  // Champs imposés par le vendeur : saisis à la création (genre, taille) ou modifiés à la main dans la fiche
  // (les clés qui commencent par « _ » sont des réglages internes, pas des champs de l'annonce)
  const manual = Object.fromEntries(Object.entries(listing.manual || {}).filter(([k, v]) => !k.startsWith("_") && v !== "" && v != null));
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
  text += `\n${modelsFor(brand)}\n`;
  // Marques ajoutées par le vendeur dans l'onglet « Marques », avec ses repères
  const myBrands = (cfg.brands || []).filter((b) => b?.name && b.cues);
  if (myBrands.length) {
    text += "\nMarques ajoutées par le vendeur et comment il les reconnaît (fais-lui confiance) :\n"
      + myBrands.slice(0, 40).map((b) => `- ${b.name} : ${b.cues}`).join("\n") + "\n";
  }
  if (corrections.length) {
    text += "\nErreurs que tu as déjà faites et que le vendeur a corrigées (apprends-en, ne les refais pas) :\n"
      + corrections.map((c) => `- ${c.titre ? `« ${c.titre} » : ` : ""}${LABELS[c.champ] || c.champ} « ${c.agent || "(vide)"} » corrigé en « ${c.vendeur} »`).join("\n") + "\n";
  }
  text += `\nGuide anti-contrefaçon (signaux à croiser avec les notes) :\n${guideFor(brand)}\n`;
  if (examples.length) {
    text += "\nPièces déjà vérifiées par le vendeur lui-même (apprends de ses verdicts, ils font foi) :\n"
      + examples.map((e) => `- ${e.title || e.brand || "pièce"} : ${e.authenticity === "fausse" ? "FAUSSE" : "AUTHENTIQUE"}`
        + (e.auth_reason ? `, parce que ${e.auth_reason}` : "")).join("\n") + "\n";
  }
  const typeText = [notes[0]?.type_article, manual.category, listing.category].filter(Boolean).join(" ");
  text += `\n${lexiqueFor(typeText)}\n`;
  text += `\nPréférences d'écriture du vendeur :\n${styleInstructions(cfg)}\n`;
  text += `\nVariante d'écriture n°${1 + Math.floor(Math.random() * 999)} (change un peu ta formulation par rapport à d'habitude).`;

  const body = {
    model: textModel,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }],
    response_format: ANNONCE_FORMAT, max_completion_tokens: 6000, temperature: 0.8,
  };
  if (textModel.includes("gpt-oss")) body.reasoning_effort = "medium";
  const a = await groq(key, body, onStep);

  // --- Relecture : un 2e modèle vérifie chaque phrase contre les photos et corrige les mots ---
  let reviewed = [];
  if (cfg.review !== false) {
    onStep?.("Relecture de l'annonce…");
    try {
      const rev = await groq(key, {
        model: REVIEW_MODEL,
        messages: [
          { role: "system", content: REVIEW_PROMPT + "\n\n" + lexiqueFor(typeText) },
          { role: "user", content: JSON.stringify({
            notes_sur_les_photos: notes[0], infos_du_vendeur: hints || "(aucune)", champs_du_vendeur: manual,
            annonce: { titre: a.titre, description: a.description },
          }) },
        ],
        response_format: REVIEW_FORMAT, max_completion_tokens: 4000, temperature: 0.2, reasoning_effort: "medium",
      }, onStep);
      // garde-fou : un relecteur qui rallonge le texte a ajouté des choses -> on refuse sa version
      const longer = rev?.description && rev.description.trim().length > a.description.trim().length * 1.1 + 20;
      if (rev?.description?.trim() && !longer) {
        a.description = rev.description;
        if (rev.titre?.trim()) a.titre = rev.titre;
        reviewed = (rev.corrections || []).filter((c) => c && c.trim());
      }
    } catch { /* la relecture est un bonus : en cas d'échec on garde la 1re version */ }
  }
  a.description = stripForbidden(a.description);
  a.titre = stripForbidden(a.titre);
  if (reviewed.length) a.notes_vendeur = `${a.notes_vendeur || ""}\n\nRelecture : ${reviewed.slice(0, 4).join(" ; ")}`.trim();

  // « Inconnu », « Non visible »... = champ vide (le doute est dans les notes)
  for (const k of ["marque", "modele", "categorie", "taille", "couleur", "matiere"]) {
    if (/^\s*(inconnue?s?|non (visible|précisée?|identifiée?|indiquée?)|n\/?a|aucune?|-|\?)\s*$/i.test(a[k] || "")) a[k] = "";
  }

  // --- Garde-fou : pas de marque ni de modèle « sûrs » sans preuve vue sur les photos ---
  const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const n0 = notes[0] || {};
  const read = norm([...(n0.textes_lus || []), n0.code_produit, n0.modele_probable].join(" "));
  const proof = String(n0.preuve_marque || "").toLowerCase();
  const order = { basse: 0, moyenne: 1, haute: 2 };
  const cap = (k, max) => { if (order[a[k]] > order[max]) a[k] = max; };
  if (a.marque && !manual.brand) {
    const b = norm(a.marque);
    const brandRead = b.length >= 2 && read.includes(b);
    const visionSaw = norm(n0.marque) && (norm(n0.marque).includes(b) || b.includes(norm(n0.marque)));
    if (!brandRead && (!visionSaw || proof.startsWith("aucun"))) {
      // marque devinée d'après le style : on la retire partout et on demande l'étiquette
      const re = new RegExp(`\\s*${a.marque.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "gi");
      a.titre = a.titre.replace(re, " ").replace(/\s{2,}/g, " ").trim();
      a.description = a.description.replace(re, " ").replace(/\s{2,}/g, " ").trim();
      a.hashtags = (a.hashtags || []).filter((t) => norm(t) !== b);
      a.marque = ""; a.confiance_marque = "basse";
      a.notes_vendeur = `Marque non lisible sur les photos (ni étiquette ni logo clair) : je ne l'ai pas devinée. ${a.notes_vendeur || ""}`.trim();
      if (!a.photo_a_ajouter) a.photo_a_ajouter = "étiquette de marque au col (de près, bien nette)";
    } else if (!brandRead) cap("confiance_marque", proof.startsWith("logo") ? "haute" : "moyenne");
  }
  // --- Contrôle par repères sans équivoque (lus ou vus par l'œil) : rattrape une marque fausse ---
  const cueText = [...(n0.textes_lus || []), ...(n0.details || []), ...(n0.signaux_authenticite || []), n0.modele_probable]
    .join(" | ").toLowerCase();
  const cueBrands = [...new Set(BRAND_SIGNATURES.filter(([, re]) => re.test(cueText)).map(([b]) => b))];
  if (!manual.brand && cueBrands.length === 1) {
    const cue = cueBrands[0];
    if (norm(a.marque) !== norm(cue)) {
      const wrong = a.marque;
      if (wrong) {
        const re = new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        a.titre = a.titre.replace(re, cue); a.description = a.description.replace(re, cue);
        a.hashtags = (a.hashtags || []).filter((t) => norm(t) !== norm(wrong));
      } else if (!norm(a.titre).includes(norm(cue))) a.titre = `${cue} ${a.titre}`.trim();
      a.marque = cue;
      a.confiance_marque = "moyenne";
      a.notes_vendeur = `Marque corrigée${wrong ? ` (« ${wrong} » → « ${cue} »)` : ""} d'après un repère vu sur les photos. ${a.notes_vendeur || ""}`.trim();
    }
  } else if (!manual.brand && cueBrands.length > 1 && a.marque) {
    a.confiance_marque = "basse"; // repères contradictoires : à vérifier
  }
  if (!a.marque && !manual.brand) a.confiance_marque = "basse";
  if (a.modele && !manual.model && !read.includes(norm(a.modele)) && !norm(n0.modele_probable)) cap("confiance_modele", "moyenne");
  if (!a.modele && !manual.model) a.confiance_modele = "basse";
  if (!a.taille && !manual.size) a.confiance_taille = "basse";

  // --- 2e lecture : quand l'agent hésite, il relit les photos et compare ---
  // marque à revérifier : pas sûre, OU « vue en logo » sans que son nom soit écrit ni reconnu par un repère connu
  const logoOnly = Boolean(a.marque) && !read.includes(norm(a.marque)) && !cueBrands.length;
  const unsureBrand = !manual.brand && (a.confiance_marque !== "haute" || logoOnly);
  const unsureModel = !manual.model && a.confiance_modele === "basse" && Boolean(a.marque || manual.brand);
  // taille : à revérifier si elle manque alors qu'il y a une étiquette, ou si elle est « lue » sans photo d'étiquette
  const unsureSize = !manual.size && (a.taille ? labelCount === 0 : labelCount > 0);
  lastVision2 = null;
  if (cfg.double_check !== false && (unsureBrand || unsureModel || unsureSize)) {
    onStep?.("L'agent n'est pas sûr : il relit les photos pour vérifier…");
    let v2 = null;
    try {
      const c2 = [{ type: "text", text: SECOND_PROMPT + (labelCount ? "\nLa première image est un gros plan d'étiquette." : "") }];
      photosB64.slice(0, 2).forEach((b64) => c2.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }));
      v2 = await groq(key, { model: visionModel, messages: [{ role: "user", content: c2 }],
        response_format: { type: "json_object" }, max_completion_tokens: 800, temperature: 0 }, onStep);
    } catch { v2 = null; } // la 2e lecture est un bonus : en cas d'échec on garde la 1re
    if (v2) {
      lastVision2 = v2;
      const text2 = [...(v2.textes_lus || []), v2.modele].join(" | ").toLowerCase();
      const cues2 = [...new Set(BRAND_SIGNATURES.filter(([, re]) => re.test(text2)).map(([b]) => b))];
      const proof2 = String(v2.preuve_marque || "").toLowerCase();
      const brand2 = cues2.length === 1 ? cues2[0] : (proof2.startsWith("aucun") ? "" : String(v2.marque || "").trim());
      // « lue comme une étiquette » : le nom seul (ou presque), pas un mot perdu dans un imprimé (« Golf Ball CHAMPION »)
      const nb2 = norm(brand2);
      const read2 = nb2.length >= 2 && (v2.textes_lus || []).some((t) => {
        const nt = norm(t);
        return nt === nb2 || (nt.startsWith(nb2) && nt.length <= nb2.length + 6);
      });
      if (unsureBrand) {
        if (a.marque && brand2 && norm(brand2) === norm(a.marque)) {
          a.confiance_marque = proof2.startsWith("texte") || proof2.startsWith("logo") || cues2.length ? "haute" : "moyenne";
          a.notes_vendeur = `Marque confirmée par une 2e lecture. ${a.notes_vendeur || ""}`.trim();
        } else if (!a.marque && brand2 && (read2 || cues2.length === 1)) {
          a.marque = brand2; a.confiance_marque = "moyenne";
          if (!norm(a.titre).includes(norm(brand2))) a.titre = `${brand2} ${a.titre}`.trim();
          a.notes_vendeur = `Marque trouvée à la 2e lecture (« ${brand2} » lu sur les photos) : vérifie-la. ${a.notes_vendeur || ""}`.trim();
        } else if (a.marque && !brand2 && !cueBrands.length
          && !read.includes(norm(a.marque)) && !norm(text2).includes(norm(a.marque))) {
          // la 1re lecture « voyait » un logo, la 2e ne voit aucune marque, et le nom n'est écrit nulle part :
          // c'est très probablement une marque inventée -> on la retire
          const wrong = a.marque;
          const re = new RegExp(`\\s*${wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "gi");
          a.titre = a.titre.replace(re, " ").replace(/\s{2,}/g, " ").trim();
          a.description = a.description.replace(re, " ").replace(/\s{2,}/g, " ").trim();
          a.hashtags = (a.hashtags || []).filter((t) => norm(t) !== norm(wrong));
          a.marque = ""; a.confiance_marque = "basse";
          a.notes_vendeur = `Marque « ${wrong} » retirée : la 2e lecture ne l'a pas confirmée et son nom n'est écrit nulle part. Ajoute une photo de l'étiquette. ${a.notes_vendeur || ""}`.trim();
          if (!a.photo_a_ajouter) a.photo_a_ajouter = "étiquette de marque au col (de près, bien nette)";
        } else if (a.marque && brand2 && norm(brand2) !== norm(a.marque)) {
          a.confiance_marque = "basse";
          a.notes_vendeur = `Les 2 lectures ne sont pas d'accord sur la marque : « ${a.marque} » ou « ${brand2} » ? À vérifier sur l'étiquette. ${a.notes_vendeur || ""}`.trim();
        }
      }
      const model2 = String(v2.modele || "").trim();
      if (unsureModel && model2 && !a.modele) {
        // on n'ajoute un modèle que si les 2 lectures donnent le même
        const m1 = norm(n0.modele_probable), m2 = norm(model2);
        if (m1 && (m1.includes(m2) || m2.includes(m1))) {
          a.modele = model2.replace(new RegExp(`^${(a.marque || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "");
          a.confiance_modele = "moyenne";
          if (!norm(a.titre).includes(norm(a.modele))) a.titre = a.titre.replace(new RegExp(`(${(a.marque || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"), `$1 ${a.modele}`);
        }
      }
      if (unsureSize && v2.taille_lue && !a.taille) {
        a.taille = String(v2.taille_lue).trim(); a.confiance_taille = "moyenne";
      }
    }
  }
  // --- Taille : jamais inventée. Gardée seulement si lue sur une étiquette (1re ou 2e lecture) ou donnée par toi ---
  if (a.taille && !manual.size) {
    const toks = (x) => String(x || "").toLowerCase().normalize("NFD").split(/[\s/,;:()|]+/).map((t) => t.replace(/[^a-z0-9.]/g, "").replace(/\.$/, "")).filter(Boolean);
    const seen = new Set([n0.taille_lue, ...(n0.textes_lus || []), lastVision2?.taille_lue, ...(lastVision2?.textes_lus || [])].flatMap(toks));
    const wanted = toks(a.taille).filter((t) => !["eu", "fr", "us", "uk", "taille", "pointure"].includes(t));
    const proven = wanted.length > 0 && wanted.every((t) => seen.has(t) || seen.has(t.replace(/^[wl]/, "")));
    // les 2 lectures ont donné des tailles différentes (ex. « L » puis « 48 ») : aucune n'est fiable
    const t2 = toks(lastVision2?.taille_lue).filter((t) => !["eu", "fr", "us", "uk"].includes(t));
    const disagree = t2.length > 0 && !t2.every((t) => wanted.includes(t)) && !wanted.every((t) => t2.includes(t));
    const provenFinal = proven && !disagree;
    if (!provenFinal) {
      const s = a.taille.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      a.titre = a.titre.replace(new RegExp(`\\s*(taille|pointure)?\\s+${s}(?![\\w])`, "i"), "").replace(/\s{2,}/g, " ").trim();
      a.description = a.description
        .replace(new RegExp(`,?\\s*(en\\s+)?(taille|pointure)\\s+${s}(?![\\w])`, "gi"), "")
        .replace(/\s+([,.])/g, "$1").replace(/\.\s*\./g, ".").trim();
      a.hashtags = (a.hashtags || []).filter((t) => !new RegExp(`(taille|pointure)?${a.taille.toLowerCase().replace(/[^a-z0-9]/g, "")}$`).test(String(t).toLowerCase().replace(/[^a-z0-9]/g, "")));
      a.notes_vendeur = `Taille « ${a.taille} » retirée : ${disagree ? `les 2 lectures ne sont pas d'accord (« ${a.taille} » / « ${lastVision2.taille_lue} »)` : "elle n'est lisible sur aucune photo"}. Indique-la toi-même ou ajoute la photo de l'étiquette de taille. ${a.notes_vendeur || ""}`.trim();
      a.taille = ""; a.confiance_taille = "basse";
    }
  }

  // --- Liste de marques : orthographe exacte, et alerte si la marque n'y est pas ---
  if (a.marque && !manual.brand) {
    const m = matchBrand(a.marque, allBrands(cfg.brands || []));
    if (m.name !== a.marque) {
      const re = new RegExp(a.marque.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      a.titre = a.titre.replace(re, m.name); a.description = a.description.replace(re, m.name);
      a.marque = m.name;
    }
    if (!m.known) {
      a.confiance_marque = "basse";
      a.notes_vendeur = `« ${a.marque} » n'est pas dans ta liste de marques : vérifie-la, et ajoute-la dans l'onglet Marques si elle existe vraiment. ${a.notes_vendeur || ""}`.trim();
    }
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
    // degré de certitude de l'agent, champ par champ (ce que le vendeur a saisi = certain)
    ai_confidence: Object.fromEntries(Object.entries({
      brand: a.confiance_marque, model: a.confiance_modele, category: a.confiance_type, size: a.confiance_taille,
    }).map(([k, v]) => [k, manual[k] ? "haute" : (CONF.includes(v) ? v : "moyenne")])),
    ai_notes: [a.notes_vendeur, a.photo_a_ajouter && `Photo utile à ajouter : ${a.photo_a_ajouter}`]
      .filter((x) => x && x.trim()).join("\n\n"),
    // Un verdict déjà donné par le vendeur n'est jamais écrasé par l'agent
    ...(["fausse", "authentique"].includes(listing.authenticity) ? {} : {
      authenticity: a.alerte === "douteux" ? "douteux" : "",
      auth_reason: a.alerte === "douteux" ? (a.raison_alerte || "").trim() : "",
    }),
  };
}
