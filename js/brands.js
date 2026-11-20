// Liste de base des marques (orthographe de référence). Tu peux en ajouter dans l'onglet « Marques » :
// elles sont enregistrées dans ton compte et s'ajoutent à celle-ci.
export const DEFAULT_BRANDS = [
  // Sport & sneakers
  "Nike", "Jordan", "Adidas", "Puma", "Reebok", "New Balance", "Asics", "Converse", "Vans", "Fila", "Kappa", "Le Coq Sportif",
  "Umbro", "Diadora", "Lotto", "Saucony", "Mizuno", "Hoka", "On Running", "Salomon", "Under Armour", "Champion", "Ellesse",
  "Sergio Tacchini", "Hummel", "Kangaroos", "K-Swiss", "Veja", "Onitsuka Tiger", "Karhu", "Merrell", "Brooks", "Decathlon", "Kipsta", "Kalenji", "Quechua",
  // Outdoor
  "The North Face", "Patagonia", "Arc'teryx", "Columbia", "Helly Hansen", "Napapijri", "Canada Goose", "Moncler", "Mammut",
  "Jack Wolfskin", "Timberland", "Fjällräven", "Berghaus", "Marmot", "Rab", "Peak Performance", "K-Way", "Aigle", "Schott",
  // Streetwear
  "Supreme", "Stüssy", "Palace", "Carhartt", "Carhartt WIP", "Dickies", "Obey", "Huf", "Element", "Quiksilver", "Billabong",
  "Volcom", "DC Shoes", "Thrasher", "Corteiz", "Trapstar", "Off-White", "Represent", "Essentials Fear of God", "Fear of God",
  "Bape", "Kith", "Aimé Leon Dore", "Polar Skate Co.", "Sixth June", "Avirex", "Alpha Industries", "Vintage Dressing",
  // Classique / premium
  "Ralph Lauren", "Polo Ralph Lauren", "Lacoste", "Tommy Hilfiger", "Tommy Jeans", "Calvin Klein", "Hugo Boss", "Boss",
  "Fred Perry", "Ben Sherman", "Gant", "Barbour", "Burberry", "Stone Island", "C.P. Company", "Paul & Shark", "Hackett",
  "Massimo Dutti", "Armani", "Emporio Armani", "Armani Exchange", "EA7", "Diesel", "Replay", "G-Star Raw", "Pepe Jeans",
  "Levi's", "Lee", "Wrangler", "Guess", "Michael Kors", "Kenzo", "A.P.C.", "Ami Paris", "Maison Kitsuné", "Sandro", "Maje",
  "Claudie Pierlot", "The Kooples", "Zadig & Voltaire", "Ba&sh", "Sézane", "Rouje", "Petit Bateau", "Saint James", "Armor Lux",
  "Le Slip Français", "Faguo", "Jott", "Pyrenex", "Eden Park", "Serge Blanco", "Aigle", "Façonnable", "Izac", "Celio", "Jules", "Devred",
  // Luxe
  "Louis Vuitton", "Gucci", "Prada", "Dior", "Chanel", "Hermès", "Balenciaga", "Saint Laurent", "Givenchy", "Versace",
  "Dolce & Gabbana", "Fendi", "Valentino", "Moschino", "Bottega Veneta", "Celine", "Loewe", "Miu Miu", "Alexander McQueen",
  "Off-White", "Palm Angels", "Dsquared2", "Philipp Plein", "Golden Goose", "Balmain", "Kenzo", "Berluti", "Tom Ford",
  "Ralph Lauren Purple Label", "Acne Studios", "Jacquemus", "Isabel Marant", "Chloé", "Max Mara", "Lanvin",
  // Grande distribution / fast fashion
  "Zara", "H&M", "Uniqlo", "Mango", "Bershka", "Pull&Bear", "Stradivarius", "Primark", "Kiabi", "C&A", "Shein", "Asos",
  "Jack & Jones", "Only", "Vero Moda", "Selected", "Superdry", "Hollister", "Abercrombie & Fitch", "Gap", "American Eagle",
  "Bonobo", "Camaïeu", "Promod", "Pimkie", "Jennyfer", "Etam", "Undiz", "Monoprix", "Cyrillus", "Okaïdi", "Tape à l'œil",
  "Vertbaudet", "Jacadi", "Bonpoint", "Catimini", "Zara Kids", "Desigual", "Springfield", "Cortefiel", "New Look",
  "River Island", "Topshop", "Urban Outfitters", "Weekday", "COS", "& Other Stories", "Arket", "Monki", "Lefties",
  // Chaussures
  "Dr. Martens", "UGG", "Birkenstock", "Clarks", "Kickers", "Palladium", "Caterpillar", "Geox", "Mephisto", "Paraboot",
  "Church's", "Sebago", "Timberland", "Crocs", "Hey Dude", "Steve Madden", "Minelli", "San Marina", "Bocage", "André",
  "Superga", "Lacoste", "Repetto", "Jonak", "Unisa",
  // Accessoires / montres / maroquinerie
  "Ray-Ban", "Oakley", "Longchamp", "Michael Kors", "Kipling", "Eastpak", "Herschel", "Fjällräven Kånken", "Swatch",
  "Casio", "G-Shock", "Seiko", "Fossil", "Daniel Wellington", "Pandora", "Swarovski", "Lancel", "Le Tanneur", "Furla",
];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

/** Fusionne la liste de base et tes marques (sans doublons), triée. */
export function allBrands(custom = []) {
  const map = new Map();
  for (const name of DEFAULT_BRANDS) map.set(norm(name), { name, custom: false, cues: "" });
  for (const b of custom) if (b?.name) map.set(norm(b.name), { name: b.name, custom: true, cues: b.cues || "" });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Retrouve la marque dans la liste (orthographe exacte).
 * Renvoie { name, known } : known = false si la marque n'est pas dans la liste.
 */
export function matchBrand(raw, list) {
  const n = norm(raw);
  if (!n) return { name: "", known: false };
  const exact = list.find((b) => norm(b.name) === n);
  if (exact) return { name: exact.name, known: true };
  // petites fautes de frappe (« Addidas », « Nkie », « The Nort Face ») sur les noms assez longs
  if (n.length >= 5) {
    let best = null, bestD = 3;
    for (const b of list) { const d = distance(n, norm(b.name)); if (d < bestD) { best = b; bestD = d; } }
    if (best && bestD <= (n.length >= 8 ? 2 : 1)) return { name: best.name, known: true };
  }
  return { name: String(raw).trim(), known: false };
}
