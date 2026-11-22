// Lexique Vinted : les mots que les vrais vendeurs utilisent.
// L'agent reçoit la partie qui correspond au type d'article, pour écrire juste et naturel.

// Défauts : le mot exact à utiliser, et ce qu'il NE faut PAS dire (mots bizarres ou faux)
export const DEFAUTS = [
  "bouloches (petites boules de tissu) — pas « peluches », « grains »",
  "petite tache (préciser où : manche, col, devant)",
  "décoloration / couleur un peu passée",
  "accroc / fil tiré",
  "petit trou",
  "couture qui se défait",
  "col un peu détendu / élastique détendu",
  "zip qui accroche",
  "plis sur l'avant (baskets, au niveau des orteils) — pas « rides », « craquelures » sauf si le cuir est vraiment craquelé",
  "semelle usée / un peu d'usure sous la semelle",
  "talon usé",
  "semelle jaunie / un peu jaunie",
  "traces / salissures sur la semelle ou la tige (« ça part au nettoyage »)",
  "lacets à changer / lacets un peu sales",
  "éraflure / frottement sur le cuir",
  "intérieur un peu usé au talon",
  "griffures sur le verre / le métal (accessoires)",
];
// mots à ne jamais écrire dans une annonce de vêtement (bizarres, médicaux, inventés)
export const INTERDITS = ["piqûre", "piqure", "aiguille", "blessure", "plaie", "cicatrice", "moisissure", "pourri",
  "cassé en deux", "vintage authentique", "rare et unique", "pièce de collection"];

// Vocabulaire et tournures par type d'article
const TYPES = {
  baskets: {
    match: /basket|sneaker|chaussure|running|tennis|jordan|air max|air force|dunk|samba|gazelle|550|tn\b/i,
    mots: ["pointure", "semelle", "tige", "languette", "lacets", "boîte d'origine", "semelle intérieure", "unité Air",
      "plis", "taille normalement", "taille petit", "suède / daim", "cuir", "mesh"],
    phrases: ["Pointure 42, portées quelques fois.", "Semelle encore bien, peu de plis.", "Vendues sans la boîte.",
      "Quelques traces sur le côté, ça part au nettoyage.", "Lacets d'origine.", "Taillent normalement."],
  },
  haut: {
    match: /sweat|hoodie|pull|gilet|t-shirt|tee|polo|chemise|haut|top|débardeur|maillot/i,
    mots: ["coupe", "regular / oversize / slim", "capuche", "poche kangourou", "col rond / col V", "manches longues / courtes",
      "molleton", "intérieur gratté", "logo brodé / imprimé", "bord-côtes", "maille", "coton"],
    phrases: ["Taille M, coupe regular.", "Logo brodé, nickel.", "Pas de bouloches.", "Un peu oversize, taille bien grand.",
      "Coton épais, bonne qualité.", "Porté mais bien entretenu."],
  },
  bas: {
    match: /jean|pantalon|jogging|short|cargo|chino|legging|jupe/i,
    mots: ["taille W/L", "coupe droite / slim / large / baggy", "taille haute / basse", "délavage", "brut", "entrejambe",
      "ourlet", "poches", "cordon de serrage", "bas élastiqué"],
    phrases: ["Taille W32 L32, coupe droite.", "Délavage clair, pas de trou.", "Entrejambe nickel.", "Ourlet d'origine.",
      "Mesures à plat sur demande."],
  },
  veste: {
    match: /veste|manteau|doudoune|parka|blouson|coupe-vent|polaire|softshell|imperméable|anorak/i,
    mots: ["capuche amovible / intégrée", "doublure", "zip intégral", "poches zippées", "rembourrage / garnissage",
      "déperlant (seulement si écrit sur l'étiquette)", "col montant", "serrage à la taille", "pressions", "polaire"],
    phrases: ["Bien chaude, rembourrage encore gonflant.", "Tous les zips fonctionnent.", "Doublure intacte.",
      "Capuche amovible.", "Aucun accroc."],
  },
  accessoire: {
    match: /sac|casquette|bonnet|écharpe|ceinture|montre|lunettes|portefeuille|sacoche/i,
    mots: ["bandoulière réglable", "fermeture éclair", "intérieur", "boucle", "ajustable", "taille unique"],
    phrases: ["Taille unique, réglable.", "Intérieur propre.", "Fermeture qui marche nickel."],
  },
};

// Façons naturelles de commencer / finir (le rédacteur s'en inspire, sans copier mot pour mot)
export const DEBUTS = ["{Type} {marque} taille {taille}.", "{Marque} {modèle}, taille {taille}.", "Je vends mon/ma {type} {marque}."];
export const FINS = ["Envoi rapide.", "Dispo pour toute question.", "Je fais des lots.", "N'hésite pas à faire une offre.", "Envoi soigné et rapide."];

/** Texte du lexique adapté au type d'article (déduit des notes de l'œil). */
export function lexiqueFor(typeText) {
  const t = Object.values(TYPES).find((x) => x.match.test(typeText || "")) || null;
  let out = "Lexique Vinted (utilise CES mots, ils sont ceux des vrais vendeurs) :\n";
  out += "Défauts — vocabulaire à employer :\n" + DEFAUTS.map((d) => `- ${d}`).join("\n");
  out += `\nMots INTERDITS (bizarres ou faux pour un vêtement) : ${INTERDITS.join(", ")}.`;
  if (t) {
    out += `\nMots utiles pour ce type d'article : ${t.mots.join(", ")}.`;
    out += "\nExemples de phrases de vrais vendeurs (inspire-toi du ton, n'écris que ce qui est vrai pour CET article) :\n"
      + t.phrases.map((p) => `- « ${p} »`).join("\n");
  }
  out += `\nFins possibles (varie) : ${FINS.join(" / ")}`;
  return out;
}

/** Retire les phrases qui contiennent un mot interdit (filet de sécurité après le relecteur). */
export function stripForbidden(text) {
  const re = new RegExp(`(${INTERDITS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i");
  return String(text || "")
    .split("\n")
    .map((line) => line.split(/(?<=[.!?])\s+/).filter((sentence) => !re.test(sentence)).join(" ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
