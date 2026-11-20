// Base de connaissances : comment reconnaître la marque et le modèle exact.
// Une ligne = « Modèle : repères visuels ». L'agent ne reçoit que la section de la marque détectée
// (plus les repères de marques), pour rester rapide. Complète-la librement.

// Reconnaître la MARQUE quand il n'y a pas d'étiquette lisible
export const BRAND_CUES = [
  "Nike : virgule (swoosh), « Just Do It », logo TN pour les Air Max Plus, Jumpman pour Jordan.",
  "Adidas : 3 bandes parallèles, trèfle (Originals), logo 3 barres en montagne (Performance).",
  "The North Face : demi-dôme à 3 arcs + texte THE / NORTH / FACE.",
  "Ralph Lauren : petit joueur de polo à cheval (pony) brodé, « Polo » écrit.",
  "Lacoste : crocodile vert en écusson.",
  "Carhartt : étiquette carrée avec un « C » stylisé (WIP) ou logo « Carhartt » avec C en relief (US).",
  "Stone Island : badge boussole amovible sur la manche gauche, 2 boutons.",
  "Moncler : écusson coq / « Moncler » sur la manche, logo tricolore.",
  "New Balance : grand « N » sur le côté, numéro du modèle sur la languette ou le talon.",
  "Puma : félin bondissant, bande « formstrip » sur le côté des chaussures.",
  "Levi's : étiquette rouge « Levi's » sur la poche arrière droite, patch cuir/carton à la ceinture avec numéro de modèle, surpiqûres en arcs sur les poches.",
  "Tommy Hilfiger : drapeau rectangulaire bleu-blanc-rouge.",
  "Calvin Klein : « CK » ou « Calvin Klein » en capitales.",
  "Champion : « C » en script avec petit « C » brodé sur la manche.",
  "Stüssy : signature graffiti « Stüssy ».",
  "Arc'teryx : squelette d'archéoptéryx.",
  "Patagonia : silhouette de montagnes (Fitz Roy) sur fond de ciel coloré.",
  "Columbia : losange bleu et logo en grille.",
  "Timberland : arbre dans un cercle.",
  "Dr. Martens : boucle de talon jaune « AirWair », coutures jaunes.",
  "Converse : étoile dans un cercle (All Star) sur la cheville, embout en caoutchouc.",
  "Vans : bande « jazz stripe » ondulée sur le côté, semelle gaufrée.",
  "Asics : bandes croisées (« Asics stripes ») sur le côté.",
  "Salomon : logo S stylisé, laçage rapide à cordon.",
  "Zara / H&M / Uniqlo / Bershka / Pull&Bear : surtout reconnaissables à l'étiquette de col.",
];

export const BRAND_MODELS = {
  "Nike": [
    "Air Force 1 : basket basse ou montante, empiècements arrondis, « AIR » sur le côté de la semelle, petit tag « Nike Air » sur la languette.",
    "Air Max 90 : bulle d'air visible au talon, gros empiècement en plastique moulé au talon, semelle « waffle ».",
    "Air Max 95 : couches ondulées dégradées sur le côté, bulles d'air à l'avant et au talon, petit swoosh près du talon.",
    "Air Max 97 : lignes horizontales réfléchissantes façon vagues, bulle d'air sur toute la longueur.",
    "Air Max Plus (TN) : « griffes » / nervures sur le côté, logo TN sur le talon et la semelle, bulles d'air visibles.",
    "Air Max 1 : bulle d'air au talon, swoosh moyen, forme simple et basse.",
    "Dunk Low : silhouette proche de l'Air Force 1 mais plus fine, empiècements bicolores, pas de « AIR » sur la semelle.",
    "Air Jordan 1 : montante (High) ou basse, aile Jumpman « Wings » à la cheville, grand swoosh.",
    "Cortez : basse et fine, grand swoosh, semelle en pointe à l'avant.",
    "Tech Fleece : sweat/jogging en molleton lisse, zips étanches, petite poche zippée sur la manche ou la cuisse.",
    "Windrunner : coupe-vent avec empiècement en chevron sur la poitrine.",
    "ACG : logo triangle ACG, vêtements outdoor.",
  ],
  "Adidas": [
    "Samba : basse, 3 bandes en T dentelé, « SAMBA » doré sur le côté, semelle gomme.",
    "Gazelle : suède, 3 bandes blanches, « GAZELLE » doré.",
    "Stan Smith : blanche, pas de bandes cousues (perforations), portrait de Stan Smith sur la languette.",
    "Superstar : embout coquillage en caoutchouc à l'avant.",
    "Campus : suède, 3 bandes, « CAMPUS » écrit.",
    "Spezial : suède, « SPEZIAL » écrit, semelle gomme.",
    "Forum : montante avec sangle à la cheville.",
    "Yeezy : tricot Primeknit (350) ou silhouette sculptée (700), pas de 3 bandes visibles.",
    "Firebird / Beckenbauer : veste de survêtement zippée avec 3 bandes sur les manches.",
  ],
  "New Balance": [
    "550 : basse, style basket de basket-ball rétro, « 550 » sur la languette.",
    "9060 : semelle très épaisse et sculptée, « 9060 » écrit.",
    "2002R : running rétro, « 2002 » sur le côté.",
    "530 : running rétro avec beaucoup de mesh argenté.",
    "574 : classique en suède, « 574 » au talon.",
    "990 / 991 / 992 / 993 : running gris « Made in USA/UK », numéro sur la languette.",
  ],
  "The North Face": [
    "Nuptse 1996 : doudoune brillante à gros boudins, capuche rangée dans le col, empiècements noirs aux épaules.",
    "Himalayan : doudoune très épaisse avec capuche, empiècements contrastés.",
    "Denali : polaire avec empiècements en nylon aux épaules et coudes.",
    "Mountain Light : veste imperméable Gore-Tex avec empiècements de couleur.",
    "Apex Bionic : softshell lisse sans capuche, poche poitrine zippée, poignets à scratch.",
    "McMurdo : parka avec capuche fourrée.",
  ],
  "Ralph Lauren": [
    "Polo Custom Slim Fit / Classic Fit : polo piqué, pony brodé, la coupe est écrite sur l'étiquette.",
    "Big Pony : grand pony brodé avec chiffre.",
    "Oxford : chemise en coton oxford à col boutonné.",
    "Pull torsadé : maille torsadée, pony brodé.",
  ],
  "Lacoste": [
    "L.12.12 : polo piqué classique, crocodile cousu.",
    "Sport : polos et survêtements techniques, crocodile en relief ou caoutchouc.",
  ],
  "Carhartt": [
    "Detroit Jacket : toile canvas, col en velours côtelé, doublure couverture.",
    "Chore Coat : veste canvas avec col en velours et 4 poches plaquées.",
    "Active Jacket (OG) : canvas avec capuche doublée.",
    "Double Knee : pantalon de travail avec double épaisseur aux genoux.",
    "Pocket T-shirt : t-shirt avec poche poitrine et petit logo.",
  ],
  "Levi's": [
    "501 : coupe droite à boutons, « 501 » sur le patch de ceinture.",
    "505 / 511 / 512 / 550 / 501 Skinny : numéro sur le patch de ceinture ou l'étiquette intérieure.",
    "Trucker Jacket : veste en jean avec poches poitrine à rabat et coutures en V.",
  ],
  "Stone Island": ["Badge boussole : le modèle est indiqué par le numéro d'article sur l'étiquette intérieure (ex. 7715...)."],
  "Moncler": ["Maya : doudoune brillante à capuche, écusson sur la manche.", "Ghany / Bady : doudounes femme cintrées."],
  "Arc'teryx": ["Beta / Alpha : vestes Gore-Tex, nom écrit sur l'étiquette intérieure.", "Atom : veste synthétique légère matelassée."],
  "Patagonia": ["Retro-X : polaire sherpa épaisse avec empiècement nylon à la poitrine.", "Better Sweater : polaire aspect laine chinée.", "Synchilla Snap-T : polaire à col pressionné et poche kangourou."],
  "Converse": ["Chuck 70 : semelle crème plus épaisse et brillante, patch noir au talon.", "Chuck Taylor All Star : modèle classique, patch talon rouge/bleu."],
  "Vans": ["Old Skool : basse avec jazz stripe.", "Sk8-Hi : montante avec jazz stripe.", "Authentic / Era : basses sans bande."],
  "Dr. Martens": ["1460 : boots 8 œillets.", "1461 : chaussure basse 3 œillets.", "2976 : Chelsea boots élastiques."],
  "Timberland": ["6-Inch Premium Boot : boots nubuck jaune blé, col rembourré."],
  "Asics": ["Gel-Kayano 14 : running rétro argenté.", "Gel-1130 : running rétro années 2000.", "Gel-Lyte III : languette fendue."],
  "Salomon": ["XT-6 / XT-4 : trail avec laçage rapide et semelle crantée.", "Speedcross : crampons très marqués."],
};

/** Texte injecté pour l'agent : repères de marques + modèles de la marque détectée. */
export function modelsFor(brand) {
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const nb = norm(brand);
  const b = nb.length >= 3 && Object.keys(BRAND_MODELS).find((k) => nb.includes(norm(k)) || norm(k).includes(nb));
  let text = "Repères pour reconnaître la marque :\n" + BRAND_CUES.map((l) => `- ${l}`).join("\n");
  if (b) text += `\n\nModèles ${b} et leurs repères :\n` + BRAND_MODELS[b].map((l) => `- ${l}`).join("\n");
  return text;
}
