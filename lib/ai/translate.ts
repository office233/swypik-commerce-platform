/**
 * Romanian → English Product Translation Dictionary
 * Used when AI orchestrator is unavailable (fallback)
 * Maps common Romanian product terms to English AliExpress search queries
 */

const RO_TO_EN: Record<string, string> = {
  // Fashion
  "rochie": "dress women", "rochii": "dress women", "fusta": "skirt women", "pantaloni": "pants trousers",
  "bluza": "blouse women", "camasa": "shirt", "tricou": "t-shirt", "hanorac": "hoodie sweatshirt",
  "geaca": "jacket coat", "palton": "coat winter", "jacheta": "jacket", "pulover": "sweater",
  "costum": "suit men", "sacou": "blazer", "vesta": "vest", "maiou": "tank top",
  "sosete": "socks", "ciorapi": "tights stockings", "lenjerie": "lingerie underwear",
  "pijama": "pajamas", "halat": "bathrobe", "esarfa": "scarf", "sal": "shawl",
  "palarie": "hat", "sapca": "cap hat", "centura": "belt", "cravata": "tie",
  "papuci": "slippers", "sandale": "sandals", "pantofi": "shoes", "ghete": "boots",
  "adidasi": "sneakers shoes", "tenisi": "sneakers canvas",

  // Beauty
  "ruj": "lipstick", "fond de ten": "foundation makeup", "mascara": "mascara",
  "fard": "eyeshadow", "pudra": "powder makeup", "crema": "cream skincare",
  "serum": "serum face", "gel de dus": "shower gel", "sampon": "shampoo",
  "balsam": "conditioner hair", "parfum": "perfume", "lac de unghii": "nail polish",
  "perie": "brush", "perie de par": "hair brush", "ondulator": "hair curler",
  "placa de par": "hair straightener", "uscator de par": "hair dryer",

  // Tech
  "casti": "wireless earbuds headphones", "telefon": "smartphone phone", "husa": "phone case",
  "incarcator": "charger USB", "cablu": "cable USB C", "baterie externa": "power bank",
  "ceas": "smart watch", "ceas inteligent": "smartwatch", "tableta": "tablet",
  "laptop": "laptop", "mouse": "mouse wireless", "tastatura": "keyboard",
  "camera": "camera webcam", "boxe": "speaker bluetooth", "microfon": "microphone",

  // Home
  "perna": "pillow", "patura": "blanket", "lenjerie de pat": "bedding set",
  "lampa": "lamp LED", "bec": "light bulb LED", "aspirator": "vacuum cleaner",
  "organizator": "organizer storage", "cutie": "storage box", "raft": "shelf",
  "perdea": "curtain", "covor": "carpet rug", "oglinda": "mirror",
  "vaza": "vase", "lumanare": "candle", "ceas de perete": "wall clock",

  // Kitchen
  "tigaie": "frying pan", "oala": "pot cooking", "cutit": "knife kitchen",
  "blender": "blender", "mixer": "mixer kitchen", "cafetiera": "coffee maker",
  "cana": "mug cup", "farfurie": "plate", "tacamuri": "cutlery set",

  // Auto
  "suport telefon masina": "car phone holder", "camera auto": "dash cam car",
  "aspirator auto": "car vacuum cleaner", "husa scaun": "car seat cover",
  "covorase auto": "car floor mats", "parasolar": "car sun visor",

  // Fitness
  "gantere": "dumbbells", "benzi de rezistenta": "resistance bands", "saltea yoga": "yoga mat",
  "sticla apa": "water bottle sport", "ceas sport": "fitness tracker watch",

  // Kids
  "jucarie": "toy", "jucarii": "toys kids", "puzzle": "puzzle", "papusa": "doll",
  "masinuta": "toy car", "lego": "building blocks",

  // Accessories
  "ochelari": "sunglasses", "ochelari soare": "sunglasses UV", "portofel": "wallet",
  "geanta": "bag handbag", "rucsac": "backpack", "bratara": "bracelet",
  "colier": "necklace", "cercei": "earrings", "inel": "ring jewelry",
};

/**
 * Translate Romanian product query to English
 * First tries exact match, then word-by-word matching
 */
export function translateQuery(roQuery: string): string {
  const normalized = roQuery.toLowerCase()
    .replace(/[ăâ]/g, "a").replace(/[șş]/g, "s").replace(/[țţ]/g, "t").replace(/[î]/g, "i");

  // Exact match
  if (RO_TO_EN[normalized]) return RO_TO_EN[normalized];

  // Try matching each word
  const words = normalized.split(/\s+/);
  const translated: string[] = [];
  let matched = false;

  for (const word of words) {
    if (RO_TO_EN[word]) {
      translated.push(RO_TO_EN[word]);
      matched = true;
    } else {
      translated.push(word); // keep original (might be English already)
    }
  }

  // If we matched at least one word, return translation
  if (matched) return translated.join(" ");

  // No match — return as-is (user might have typed English)
  return roQuery;
}
