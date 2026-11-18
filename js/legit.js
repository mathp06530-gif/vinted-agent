// Guide anti-contrefaçon donné à l'agent rédacteur.
// Ce sont des SIGNAUX fréquents, pas des preuves : un seul signal = "douteux", jamais "fausse" à coup sûr.
// Complète cette liste au fil de tes vérifications (une ligne par signal, en français simple).

export const GENERAL = [
  "Pays de fabrication incohérent avec la marque (ex. « Made in Italy » sur Nike, Adidas, The North Face, Carhartt WIP, qui sont fabriqués en Asie).",
  "Étiquette de col avec un texte inhabituel ou inventé, fautes d'orthographe, police ou couture grossière.",
  "Pas d'étiquette intérieure avec un code produit, ou code qui ne suit pas le format de la marque.",
  "Logo mal proportionné, broderie baveuse, lettres collées ou espacement irrégulier.",
  "Design qui ne correspond à aucun vrai modèle de la marque (trop de zips, logos partout, mélange de gammes).",
  "Pièce « neuve avec étiquette » vendue très en dessous du prix normal, ou étiquettes cartonnées génériques.",
];

export const BRANDS = {
  "The North Face": [
    "Les vraies ont des étiquettes blanches intérieures avec un code style qui commence par NF0A (ex. NF0A3XEO).",
    "Fabrication quasi toujours en Asie (Chine, Vietnam, Bangladesh, Cambodge, Indonésie...).",
    "Logo : demi-dôme à 3 arcs bien séparés, texte THE / NORTH / FACE aligné à gauche, broderie fine et dense.",
    "Contrefaçon très répandue : veste softshell à capuche avec 4 poches zippées verticales devant et logos sur poitrine, dos et manche.",
    "Textes d'étiquette de col comme « California Heritage » ne correspondent pas aux étiquettes habituelles de la marque.",
  ],
  "Nike": [
    "Étiquette intérieure avec code style au format 6 chiffres/lettres - 3 chiffres (ex. CW2288-111), qui doit correspondre au coloris.",
    "Chaussures : étiquette de taille dans la languette avec code style, dates de fabrication cohérentes, même code que la boîte.",
    "Swoosh brodé net, sans fils qui dépassent ; sur les Tech Fleece, zips et coutures soudées propres.",
  ],
  "Jordan": [
    "Même logique que Nike : code style sur l'étiquette de languette, Jumpman bien proportionné (doigts, lacets visibles).",
  ],
  "Adidas": [
    "Code article au format 2 lettres + 4 chiffres (ex. GY7037) sur l'étiquette intérieure.",
    "Trèfle ou 3 bandes réguliers, bandes bien parallèles et de même largeur.",
  ],
  "Ralph Lauren": [
    "Le poney brodé est fin et détaillé (maillet, rênes, pattes séparées) ; un poney épais ou flou est suspect.",
    "Étiquette de col et étiquette de taille séparées, coutures propres.",
  ],
  "Lacoste": [
    "Le crocodile est un écusson cousu, détaillé (dents, griffes, écailles) ; un croco plat ou imprimé sur polo est suspect.",
    "Tailles en chiffres français (2 à 8) sur les polos classiques.",
    "Boutons gravés « Lacoste » sur un polo classique : signal fréquent de contrefaçon.",
  ],
  "Stone Island": [
    "Badge boussole cousu avec 2 boutons, dos du badge avec infos et code d'authentification (Certilogo / QR) à vérifier.",
  ],
  "Moncler": [
    "Étiquette avec QR code / NFC d'authenticité ; logo coq bien détaillé.",
  ],
  "Canada Goose": [
    "Écusson brodé détaillé et étiquette avec hologramme d'authenticité.",
  ],
  "Carhartt": [
    "Étiquette carrée « C » cousue proprement ; Carhartt WIP et Carhartt US ont des étiquettes différentes mais toujours nettes.",
  ],
};

/** Texte du guide pour une marque donnée (+ les signaux généraux). */
export function guideFor(brand) {
  const b = Object.keys(BRANDS).find((k) => brand && brand.toLowerCase().includes(k.toLowerCase()));
  const lines = ["Signaux généraux :", ...GENERAL.map((l) => `- ${l}`)];
  if (b) lines.push(`Signaux propres à ${b} :`, ...BRANDS[b].map((l) => `- ${l}`));
  return lines.join("\n");
}
