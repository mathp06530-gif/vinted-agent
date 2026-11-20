// Catégories proches de celles de Vinted (France), pour que l'agent choisisse un chemin précis.
// Liste volontairement compacte : l'agent peut affiner le dernier niveau si besoin.
const COMMUN = {
  "Manteaux et vestes": ["Doudounes", "Parkas", "Vestes softshell", "Polaires", "Coupe-vent", "Vestes en jean", "Blousons aviateur", "Vestes en cuir", "Vestes sans manches", "Manteaux en laine", "Trenchs", "Vestes de sport"],
  "Sweats et pulls": ["Sweats à capuche", "Sweats zippés", "Sweats", "Pulls", "Gilets", "Pulls col roulé"],
  "Hauts et t-shirts": ["T-shirts", "Polos", "Chemises", "Débardeurs", "T-shirts manches longues"],
  "Pantalons": ["Jeans", "Pantalons chino", "Joggings", "Pantalons cargo", "Pantalons de costume"],
  "Shorts": ["Shorts en jean", "Shorts de sport", "Shorts chino"],
  "Sport": ["Hauts de sport", "Bas de sport", "Ensembles de survêtement", "Maillots de football"],
  "Chaussures": ["Baskets", "Chaussures de running", "Bottes", "Boots", "Mocassins", "Sandales", "Claquettes", "Chaussures habillées"],
  "Accessoires": ["Casquettes", "Bonnets", "Écharpes", "Sacs à dos", "Sacoches", "Ceintures", "Lunettes de soleil", "Montres", "Portefeuilles"],
};
const FEMMES_EN_PLUS = {
  "Robes": ["Robes courtes", "Robes longues", "Robes midi", "Robes de soirée"],
  "Jupes": ["Minijupes", "Jupes midi", "Jupes longues", "Jupes en jean"],
  "Hauts et t-shirts": ["Tops", "Blouses", "Crop tops", "Bodys"],
  "Pantalons": ["Leggings", "Pantalons larges", "Jeans mom", "Jeans flare"],
  "Combinaisons": ["Combinaisons longues", "Combishorts"],
  "Chaussures": ["Escarpins", "Ballerines", "Talons"],
  "Sacs": ["Sacs à main", "Sacs bandoulière", "Tote bags", "Pochettes"],
};

function paths(root, base, extra = {}) {
  const out = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(extra)]);
  for (const k of keys) {
    const subs = [...(base[k] || []), ...(extra[k] || [])];
    out.push(`${root} > ${k} > ${subs.join(" / ")}`);
  }
  return out;
}

/** Texte des catégories pour le genre donné (ou toutes si inconnu). */
export function categoriesFor(gender) {
  const g = (gender || "").toLowerCase();
  const lines = [];
  if (!g || g === "homme" || g === "unisexe") lines.push(...paths("Hommes", COMMUN));
  if (!g || g === "femme" || g === "unisexe") lines.push(...paths("Femmes", COMMUN, FEMMES_EN_PLUS));
  if (!g || g === "enfant") lines.push("Enfants > Garçons > (vêtement ou chaussure)", "Enfants > Filles > (vêtement ou chaussure)");
  return lines.join("\n");
}
