/**
 * AI CATEGORY CLEANUP — Recategorizare inteligentă + Ștergere junk
 * 
 * Analizează titlul fiecărui produs și:
 * 1. Detectează categoria REALĂ bazat pe cuvinte cheie
 * 2. Șterge produsele care nu se potrivesc (butoaie plastice, etc.)
 * 3. Curăță titlurile de junk ("Trading transfrontalier", caractere chinezești, etc.)
 * 
 * Usage: npx tsx scripts/cleanup-categories.ts
 */

import { Pool } from "pg";

const pool = new Pool({
  host: "localhost", port: 5432,
  database: "aicevrei_products",
  user: "postgres", password: "postgres",
});

// ─── Category Detection Rules ────────────────────────────────────────
// Fiecare regulă: array de keywords → categorie corectă
const CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  // HUSE & ACCESORII TELEFON
  { keywords: ["husă", "husa", "huse", "phone case", "carcasa telefon", "iphone", "samsung galaxy", "telefon mobil protecție", "silicon telefon"], category: "Huse Telefon" },
  { keywords: ["folie", "screen protector", "sticlă securizată", "tempered glass", "protecție ecran"], category: "Folii Protecție" },
  { keywords: ["cablu USB", "încărcător", "charger", "charging cable", "adaptor priză", "fast charging"], category: "Încărcătoare" },
  { keywords: ["power bank", "baterie externă", "baterie portabilă", "acumulator extern"], category: "Baterii Externe" },
  { keywords: ["suport telefon", "phone holder", "car mount", "suport auto"], category: "Accesorii Auto" },

  // TECH & GADGETS
  { keywords: ["căști", "casti", "earbuds", "headphone", "airpods", "bluetooth audio", "in-ear", "over-ear", "wireless audio"], category: "Căști Wireless" },
  { keywords: ["smartwatch", "smart watch", "ceas inteligent", "fitness tracker", "band fitness", "bratara fitness"], category: "Smartwatch" },
  { keywords: ["boxă", "boxa", "speaker", "difuzor bluetooth", "portabil sunet"], category: "Boxe Bluetooth" },
  { keywords: ["mouse", "tastatură", "keyboard", "gaming pad", "mouse pad", "RGB gaming", "gamepad", "joystick"], category: "Gaming" },
  { keywords: ["led strip", "bandă led", "lumini led", "fairy lights", "neon", "decorațiune luminoasă", "string light"], category: "Lumini LED" },
  { keywords: ["proiector", "projector", "mini proiector"], category: "Proiectoare" },
  { keywords: ["dronă", "drone", "quadcopter", "UAV"], category: "Drone" },
  { keywords: ["dashcam", "camera auto", "camera bord", "recorder auto"], category: "Camera Auto" },
  { keywords: ["ring light", "lampa selfie", "lumina selfie"], category: "Ring Light" },
  { keywords: ["webcam", "microfon", "streaming"], category: "Streaming" },
  { keywords: ["laptop stand", "suport laptop", "desk stand"], category: "Accesorii Laptop" },
  { keywords: ["periuță", "periuta", "toothbrush", "sonic oral"], category: "Îngrijire Dentară" },

  // FASHION - FEMEI
  { keywords: ["rochie", "rochii", "dress", "women dress"], category: "Rochii" },
  { keywords: ["bluză", "bluza", "blouse", "top femei", "women top"], category: "Bluze Femei" },
  { keywords: ["fustă", "fusta", "skirt"], category: "Fuste" },
  { keywords: ["jachetă femei", "jacheta femei", "coat women", "palton femei", "trench femei"], category: "Jachete Femei" },
  { keywords: ["costum de baie", "bikini", "swimsuit", "swimwear", "costum înot"], category: "Costume de Baie" },
  { keywords: ["pijama", "sleepwear", "nightgown", "camasa noapte"], category: "Pijamale" },
  { keywords: ["lenjerie intimă", "lenjerie", "bra ", "sutien", "lingerie", "chiloți femei"], category: "Lenjerie" },
  { keywords: ["colanți", "colanti", "legging", "yoga pants"], category: "Colanți" },

  // FASHION - BĂRBAȚI
  { keywords: ["tricou", "t-shirt", "men shirt", "polo bărbați"], category: "Tricouri Bărbați" },
  { keywords: ["pantaloni", "jeans", "pants men", "chino", "cargo pants"], category: "Pantaloni Bărbați" },
  { keywords: ["jachetă bărbați", "jacheta barbati", "bomber", "men jacket", "men coat"], category: "Jachete Bărbați" },
  { keywords: ["hanorac", "hoodie", "sweatshirt", "pulover"], category: "Hanorace" },
  { keywords: ["trening", "tracksuit", "sportswear set", "ținută sport"], category: "Ținute Sport" },

  // FASHION - UNISEX
  { keywords: ["șosete", "sosete", "socks", "ciorapi"], category: "Șosete" },
  { keywords: ["eșarfă", "esarfa", "scarf", "shawl", "fular", "batic"], category: "Eșarfe" },
  { keywords: ["pălărie", "palarie", "hat", "cap", "șapcă", "sapca", "bucket hat", "beanie", "caciula"], category: "Pălării & Șepci" },
  { keywords: ["curea", "belt", "centură"], category: "Curele" },

  // ÎNCĂLȚĂMINTE
  { keywords: ["adidași", "adidasi", "sneaker", "pantofi sport", "running shoes", "pantofi alergare"], category: "Sneakers" },
  { keywords: ["sandale", "sandals", "papuci plajă"], category: "Sandale" },
  { keywords: ["papuci", "slippers", "papuci casă"], category: "Papuci" },
  { keywords: ["ghete", "boots", "bocanci", "cizme"], category: "Ghete" },
  { keywords: ["pantofi copii", "children shoes", "kids shoes"], category: "Pantofi Copii" },

  // GENȚI & BAGAJE
  { keywords: ["geantă", "geanta", "handbag", "crossbody", "tote bag", "poșetă", "poseta", "shoulder bag"], category: "Genți" },
  { keywords: ["rucsac", "backpack", "ghiozdan", "school bag"], category: "Rucsacuri" },
  { keywords: ["portofel", "wallet", "purse", "card holder", "portmoneu"], category: "Portofele" },

  // BIJUTERII
  { keywords: ["colier", "necklace", "lănțișor", "lantisor", "pandantiv", "pendant"], category: "Coliere" },
  { keywords: ["cercei", "earring", "stud", "hoop earring"], category: "Cercei" },
  { keywords: ["inel", "ring", "verighetă"], category: "Inele" },
  { keywords: ["brățară", "bratara", "bracelet", "bangle"], category: "Brățări" },
  { keywords: ["ceas", "watch", "orologiu", "wristwatch"], category: "Ceasuri" },

  // BEAUTY
  { keywords: ["skincare", "serum", "cremă față", "crema fata", "toner", "moisturizer", "face care"], category: "Skincare" },
  { keywords: ["makeup", "machiaj", "pensulă", "pensula", "fond de ten", "rimel", "ruj", "fard"], category: "Machiaj" },
  { keywords: ["unghii", "nail", "gel lac", "manichiură", "ojă"], category: "Unghii" },
  { keywords: ["parfum", "perfume", "fragrance", "eau de", "cologne"], category: "Parfumuri" },
  { keywords: ["uscat păr", "hair dryer", "placa par", "straightener", "ondulator", "curler"], category: "Coafură" },
  { keywords: ["mască facială", "masca faciala", "face mask", "sheet mask"], category: "Măști Faciale" },
  { keywords: ["masaj", "massage", "gun masaj", "fascia"], category: "Masaj" },
  { keywords: ["difuzor ulei", "aromatherapy", "aromaterapie", "essential oil", "ulei esențial"], category: "Aromaterapie" },
  { keywords: ["accesoriu păr", "accesorii par", "hair clip", "hair band", "bentiță", "agrafă"], category: "Accesorii Păr" },

  // CASĂ & DECOR
  { keywords: ["cană", "cana", "mug", "pahar", "cup ceramic"], category: "Căni & Pahare" },
  { keywords: ["tablou", "poster", "canvas", "wall art", "print decorativ"], category: "Tablouri" },
  { keywords: ["pernă", "perna", "pillow", "cushion"], category: "Perne Decorative" },
  { keywords: ["covor", "carpet", "rug", "preș"], category: "Covoare" },
  { keywords: ["lampă", "lampa", "lamp", "desk light", "veioza"], category: "Lămpi Birou" },
  { keywords: ["ghiveci", "flower pot", "vază", "vaza", "vase"], category: "Ghivece & Vaze" },
  { keywords: ["perdea", "curtain", "draperie"], category: "Perdele" },
  { keywords: ["cutie", "storage box", "organizer", "container depozitare"], category: "Cutii Organizare" },
  { keywords: ["bucătărie", "bucatarie", "kitchen", "organizator bucătărie"], category: "Organizare Bucătărie" },
  { keywords: ["baie", "bathroom", "suport prosoape", "suport sapun"], category: "Accesorii Baie" },
  { keywords: ["lenjerie pat", "bedding", "cearșaf", "pilotă", "duvet cover"], category: "Lenjerie de Pat" },
  { keywords: ["prosop", "towel"], category: "Prosoape" },
  { keywords: ["sculă", "tool", "unelte", "set șurubelnițe", "cheie"], category: "Scule & Unelte" },

  // SPORT & OUTDOOR
  { keywords: ["fitness", "resistance band", "yoga", "gantere", "halteră"], category: "Fitness" },
  { keywords: ["sticlă apă", "water bottle", "bidon", "termos"], category: "Sport" },
  { keywords: ["camping", "tent", "cort", "hiking", "outdoor"], category: "Camping" },
  { keywords: ["bicicletă", "bicycle", "ciclism", "bike"], category: "Ciclism" },
  { keywords: ["pescuit", "fishing", "undita", "lanseta", "momeli"], category: "Pescuit" },
  { keywords: ["înot", "swimming", "ochelari înot", "swimsuit"], category: "Înot" },

  // AUTO
  { keywords: ["husă scaun auto", "car seat cover"], category: "Huse Scaun Auto" },
  { keywords: ["interior auto", "car LED", "car accessory"], category: "Interior Auto" },

  // COPII
  { keywords: ["jucărie", "jucarii", "toys", "puzzle copii", "educational"], category: "Jucării Copii" },
  { keywords: ["haine bebe", "baby clothes", "newborn", "infant"], category: "Haine Bebeluși" },
  { keywords: ["haine animale", "pet clothes", "dog outfit"], category: "Haine Animale" },
  { keywords: ["câine", "pisică", "pet", "dog", "cat", "zgardă"], category: "Accesorii Animale" },

  // MISC
  { keywords: ["breloc", "keychain", "charm"], category: "Brelocuri" },
  { keywords: ["sticker", "decal", "autocolant"], category: "Stickere" },
  { keywords: ["cadou", "gift", "gadget amuzant"], category: "Cadouri Creative" },
];

// ─── JUNK DETECTION — Products to DELETE ─────────────────────────────
const JUNK_PATTERNS = [
  /butoi/i, /butoaie/i, /găleată/i, /galeata/i,
  /ambalaj/i, /ambalare/i, /paletă/i,
  /industrial/i, /fabrică/i, /fabrica/i,
  /en-gros/i, /en gros/i, /wholesale/i,
  /chimice/i, /chimic/i, /detergent/i,
  /materii prime/i, /semifabricat/i,
  /tub PVC/i, /țeavă/i, /teava/i,
  /robinet/i, /racord/i,
  /rezervor/i, /cisternă/i,
  /palet/i, /stivuitor/i,
  /beton/i, /ciment/i,
  /agricol/i, /pesticid/i, /insecticid/i,
  /medical(?!.*bijuter)/i, /chirurgical/i, /spital/i,
  /livrare minimă/i, /comanda minima/i,
  /catalog furnizor/i, /mostre gratuite/i,
];

// ─── TITLE CLEANUP ──────────────────────────────────────────────────
function cleanTitle(title: string): string {
  return title
    // Remove Chinese characters
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]+/g, "")
    // Remove trade junk
    .replace(/\(?(Trading |comer[tț]\s*(exterior\s*)?)?transfrontalier\)?[,\s]*/gi, "")
    .replace(/\(?comer[tț]\s+exterior\)?[,\s]*/gi, "")
    .replace(/vânzare fierbinte[,\s]*/gi, "")
    .replace(/stație independentă[,\s]*/gi, "")
    .replace(/Huaqiangbei[,\s]*/gi, "")
    .replace(/Putian[,\s]*/gi, "")
    .replace(/AliExpress[,\s]*/gi, "")
    .replace(/Amazon[,\s]*/gi, "")
    .replace(/Yiwu[,\s]*/gi, "")
    .replace(/model privat[,\s]*/gi, "")
    .replace(/sursă directă[,\s]*/gi, "")
    .replace(/fabricare directă[,\s]*/gi, "")
    .replace(/nou[ăa]?\s+\d{4}\s*/gi, "")
    .replace(/\b20\d{2}\b/g, "")
    // Clean up spacing
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/^[\s,]+/, "")
    .replace(/[\s,]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── DETECT REAL CATEGORY ───────────────────────────────────────────
function detectCategory(title: string, originalTitle: string): string | null {
  const combined = `${title} ${originalTitle}`.toLowerCase();
  
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (combined.includes(kw.toLowerCase())) {
        return rule.category;
      }
    }
  }
  return null; // Can't determine — keep original
}

// ─── MAIN ───────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(70));
  console.log("🧹 AI CATEGORY CLEANUP");
  console.log("═".repeat(70));

  const { rows: totalBefore } = await pool.query("SELECT COUNT(*) as cnt FROM products");
  console.log(`\n📦 Produse înainte: ${totalBefore[0].cnt}`);

  // 1. DELETE JUNK
  console.log("\n── Ștergere junk ──");
  let deletedJunk = 0;
  const { rows: allProducts } = await pool.query("SELECT id, title FROM products");
  
  for (const p of allProducts) {
    for (const pattern of JUNK_PATTERNS) {
      if (pattern.test(p.title)) {
        await pool.query("DELETE FROM products WHERE id = $1", [p.id]);
        deletedJunk++;
        if (deletedJunk <= 10) console.log(`  🗑️  "${p.title.substring(0, 60)}..."`);
        break;
      }
    }
  }
  console.log(`  ✅ Șterse ${deletedJunk} produse junk`);

  // 2. RECATEGORIZE
  console.log("\n── Recategorizare ──");
  const { rows: products } = await pool.query("SELECT id, title, original_title, category FROM products");
  let recategorized = 0;
  let titlesCleaned = 0;
  const catChanges: Record<string, number> = {};

  for (const p of products) {
    const cleanedTitle = cleanTitle(p.title);
    const detectedCat = detectCategory(cleanedTitle, p.original_title || "");
    
    let updates: string[] = [];
    let params: any[] = [];
    let paramIdx = 1;

    // Clean title if changed
    if (cleanedTitle !== p.title && cleanedTitle.length > 5) {
      updates.push(`title = $${paramIdx++}`);
      params.push(cleanedTitle);
      titlesCleaned++;
    }

    // Recategorize if detected different
    if (detectedCat && detectedCat !== p.category) {
      updates.push(`category = $${paramIdx++}`);
      params.push(detectedCat);
      recategorized++;
      const key = `${p.category} → ${detectedCat}`;
      catChanges[key] = (catChanges[key] || 0) + 1;
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      params.push(p.id);
      await pool.query(
        `UPDATE products SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
        params
      );
    }
  }

  console.log(`  ✅ Recategorizate: ${recategorized} produse`);
  console.log(`  ✅ Titluri curățate: ${titlesCleaned}`);

  // Show top changes
  const topChanges = Object.entries(catChanges).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (topChanges.length > 0) {
    console.log("\n  📂 Top schimbări categorii:");
    for (const [change, count] of topChanges) {
      console.log(`     ${change}: ${count} produse`);
    }
  }

  // 3. DELETE products with very short titles
  const { rows: shortTitles } = await pool.query("DELETE FROM products WHERE LENGTH(title) < 8 RETURNING id");
  console.log(`\n  🗑️  Șterse ${shortTitles.length} produse cu titluri prea scurte`);

  // 4. FINAL STATS
  const { rows: totalAfter } = await pool.query("SELECT COUNT(*) as cnt FROM products");
  const { rows: cats } = await pool.query("SELECT category, COUNT(*) as cnt FROM products GROUP BY category ORDER BY cnt DESC");

  console.log(`\n${"═".repeat(70)}`);
  console.log("📊 REZULTAT CLEANUP");
  console.log("═".repeat(70));
  console.log(`  📦 Produse înainte: ${totalBefore[0].cnt}`);
  console.log(`  🗑️  Șterse (junk): ${deletedJunk + shortTitles.length}`);
  console.log(`  🔄 Recategorizate: ${recategorized}`);
  console.log(`  ✏️  Titluri curățate: ${titlesCleaned}`);
  console.log(`  📦 Produse după: ${totalAfter[0].cnt}`);
  console.log(`\n  📂 Categorii curate (${cats.length} total):`);
  for (const c of cats) {
    console.log(`     ${c.category}: ${c.cnt} produse`);
  }

  await pool.end();
}

main().catch(console.error);
