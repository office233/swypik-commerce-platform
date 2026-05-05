/**
 * Enhanced product supplier with bilingual search
 * Real product images from Unsplash
 * Proper RO→EN keyword mapping
 */

import { SupplierProduct } from "../types";

// Romanian → English keyword mapping for smart search
const RO_KEYWORDS: Record<string, string[]> = {
  "casti": ["earbuds", "headphone", "wireless", "bluetooth", "audio"],
  "căști": ["earbuds", "headphone", "wireless", "bluetooth", "audio"],
  "wireless": ["wireless", "bluetooth"],
  "telefon": ["phone", "charging", "magsafe", "mount"],
  "masina": ["car", "auto", "vehicle", "mount"],
  "mașină": ["car", "auto", "vehicle", "mount"],
  "auto": ["car", "auto", "vehicle", "vacuum", "mount"],
  "lampa": ["lamp", "led", "light", "strip"],
  "lampă": ["lamp", "led", "light", "strip"],
  "led": ["led", "light", "strip", "rgb"],
  "ceas": ["watch", "smart", "fitness", "tracker"],
  "smartwatch": ["watch", "smart", "fitness"],
  "beauty": ["facial", "brush", "cleansing", "skin"],
  "frumusete": ["facial", "brush", "cleansing", "beauty"],
  "fitness": ["fitness", "sport", "health", "massager", "watch"],
  "sport": ["sport", "fitness", "waterproof", "ipx"],
  "casa": ["home", "house", "light", "blender", "lamp"],
  "casă": ["home", "house", "light", "blender", "lamp"],
  "cadou": ["gift", "gadget", "portable", "mini"],
  "gadget": ["gadget", "portable", "mini", "smart", "tech"],
  "aspirator": ["vacuum", "cleaner", "portable"],
  "incarcator": ["charger", "charging", "wireless"],
  "încărcător": ["charger", "charging", "wireless"],
  "masaj": ["massager", "neck", "pulse"],
  "blender": ["blender", "juicer", "mixer"],
  "perie": ["brush", "cleansing", "facial"],
  "suport": ["mount", "holder", "stand"],
  "lumina": ["light", "led", "lamp", "strip"],
  "decor": ["light", "led", "rgb", "ambient"],
  "tech": ["tech", "wireless", "smart", "bluetooth", "usb"],
  "ieftin": ["budget", "cheap", "affordable"],
  "bun": ["good", "quality", "best", "popular"],
};

const MOCK_PRODUCTS: SupplierProduct[] = [
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006123456",
    sourceUrl: "https://aliexpress.com/item/1005006123456.html",
    title: "Căști Bluetooth 5.3 TWS Wireless, Noise Cancelling, IPX5 Sport",
    description: "Căști wireless Bluetooth 5.3 cu anulare activă a zgomotului, certificare IPX5 rezistență la apă, 30 ore autonomie totală cu carcasa de încărcare, control tactil, microfon încorporat HD pentru apeluri clare. Compatibile iOS și Android.",
    price: 42,
    shipping: 0,
    currency: "RON",
    rating: 4.8,
    orders: 12500,
    deliveryDays: 12,
    images: [
      "https://images.unsplash.com/photo-1590658268037-6bf12f032f55?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=400&h=400&fit=crop",
    ],
    category: "tech",
    variants: [
      { sourceVariantId: "v1a", title: "Negru", options: { color: "Negru" }, price: 42, stockStatus: "in_stock" },
      { sourceVariantId: "v1b", title: "Alb", options: { color: "Alb" }, price: 42, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006234567",
    sourceUrl: "https://aliexpress.com/item/1005006234567.html",
    title: "Aspirator Auto Portabil Wireless, Putere 8000Pa, USB-C",
    description: "Aspirator portabil fără fir pentru mașină cu aspirare puternică 8000Pa, filtru HEPA, reîncărcare rapidă USB-C, design ultraușor, include duze multiple pentru curățare interioară auto.",
    price: 38,
    shipping: 5,
    currency: "RON",
    rating: 4.7,
    orders: 8900,
    deliveryDays: 10,
    images: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1527515637462-cee1395c2a44?w=400&h=400&fit=crop",
    ],
    category: "auto",
    variants: [
      { sourceVariantId: "v2a", title: "Standard", options: { type: "Standard" }, price: 38, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006345678",
    sourceUrl: "https://aliexpress.com/item/1005006345678.html",
    title: "Lampă LED Ambientală RGB, 16 Culori, Control Tactil",
    description: "Lampă decorativă LED cu 16 culori RGB, control tactil intuitiv, alimentare USB, perfectă pentru dormitor, birou gaming sau living. Tranziții fluide între culori și luminozitate reglabilă.",
    price: 55,
    shipping: 0,
    currency: "RON",
    rating: 4.9,
    orders: 21000,
    deliveryDays: 14,
    images: [
      "https://images.unsplash.com/photo-1507473885765-e6ed057ab6fe?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400&h=400&fit=crop",
    ],
    category: "casa",
    variants: [
      { sourceVariantId: "v3a", title: "Sferă", options: { shape: "Sfera" }, price: 55, stockStatus: "in_stock" },
      { sourceVariantId: "v3b", title: "Cub", options: { shape: "Cub" }, price: 55, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006456789",
    sourceUrl: "https://aliexpress.com/item/1005006456789.html",
    title: "Perie Sonoră Facială IPX7, 5 Moduri, Silicon Moale",
    description: "Perie facială cu vibrații sonice pentru curățare profundă, silicon medical hipoalergenic, 5 moduri de vibrație, rezistentă la apă IPX7, reîncărcabilă USB, exfoliere delicată pentru orice tip de ten.",
    price: 28,
    shipping: 0,
    currency: "RON",
    rating: 4.6,
    orders: 6500,
    deliveryDays: 11,
    images: [
      "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop",
    ],
    category: "beauty",
    variants: [
      { sourceVariantId: "v4a", title: "Roz", options: { color: "Roz" }, price: 28, stockStatus: "in_stock" },
      { sourceVariantId: "v4b", title: "Alb", options: { color: "Alb" }, price: 28, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006567890",
    sourceUrl: "https://aliexpress.com/item/1005006567890.html",
    title: "Ceas Smart Watch HD 1.85\", Fitness Tracker, IP68",
    description: "Smartwatch cu ecran HD 1.85 inch, monitor ritm cardiac și SpO2, 100+ moduri sport, rezistent la apă IP68, tracking somn, numărător de pași, autonomie 7 zile, compatibil iOS și Android.",
    price: 65,
    shipping: 0,
    currency: "RON",
    rating: 4.7,
    orders: 34000,
    deliveryDays: 13,
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=400&h=400&fit=crop",
    ],
    category: "fitness",
    variants: [
      { sourceVariantId: "v5a", title: "Negru", options: { color: "Negru" }, price: 65, stockStatus: "in_stock" },
      { sourceVariantId: "v5b", title: "Argintiu", options: { color: "Argintiu" }, price: 68, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006678901",
    sourceUrl: "https://aliexpress.com/item/1005006678901.html",
    title: "Suport Telefon Auto Magnetic MagSafe, Rotire 360°",
    description: "Suport magnetic ultra puternic pentru telefon, fixare pe grilajul de ventilație, rotire 360°, compatibil MagSafe, operare cu o singură mână, universal pentru orice smartphone.",
    price: 22,
    shipping: 0,
    currency: "RON",
    rating: 4.8,
    orders: 56000,
    deliveryDays: 9,
    images: [
      "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=400&fit=crop",
    ],
    category: "auto",
    variants: [
      { sourceVariantId: "v6a", title: "Standard", options: { type: "Air Vent" }, price: 22, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006789012",
    sourceUrl: "https://aliexpress.com/item/1005006789012.html",
    title: "Blender Portabil Mini 380ml, USB-C, 6 Lame Inox",
    description: "Blender personal cu 6 lame din oțel inoxidabil, capacitate 380ml, reîncărcare USB-C, face smoothie-uri proaspete în 30 secunde, materiale BPA-free, ideal pentru sală, birou sau călătorii.",
    price: 35,
    shipping: 0,
    currency: "RON",
    rating: 4.6,
    orders: 7800,
    deliveryDays: 15,
    images: [
      "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400&h=400&fit=crop",
    ],
    category: "casa",
    variants: [
      { sourceVariantId: "v7a", title: "Roz", options: { color: "Roz" }, price: 35, stockStatus: "in_stock" },
      { sourceVariantId: "v7b", title: "Alb", options: { color: "Alb" }, price: 35, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006890123",
    sourceUrl: "https://aliexpress.com/item/1005006890123.html",
    title: "Bandă LED RGB 5M WiFi, Sincronizare Muzică, Alexa",
    description: "Bandă LED 5 metri cu control WiFi, sincronizare cu muzica, control vocal Alexa și Google Home, telecomandă 44 butoane, 16 milioane culori, instalare ușoară cu adeziv, tăiabilă.",
    price: 30,
    shipping: 0,
    currency: "RON",
    rating: 4.7,
    orders: 19000,
    deliveryDays: 16,
    images: [
      "https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=400&fit=crop",
    ],
    category: "casa",
    variants: [
      { sourceVariantId: "v8a", title: "5M", options: { length: "5M" }, price: 30, stockStatus: "in_stock" },
      { sourceVariantId: "v8b", title: "10M", options: { length: "10M" }, price: 52, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006901234",
    sourceUrl: "https://aliexpress.com/item/1005006901234.html",
    title: "Încărcător Wireless 15W Fast Charge MagSafe",
    description: "Încărcător wireless rapid 15W cu aliniere MagSafe, indicator LED, bază anti-alunecare din silicon, protecție la supraîncărcare, compatibil iPhone 15/14/13, Samsung Galaxy, AirPods Pro.",
    price: 25,
    shipping: 0,
    currency: "RON",
    rating: 4.8,
    orders: 42000,
    deliveryDays: 11,
    images: [
      "https://images.unsplash.com/photo-1586816879360-004f5b0c51e3?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400&h=400&fit=crop",
    ],
    category: "tech",
    variants: [
      { sourceVariantId: "v9a", title: "Negru", options: { color: "Negru" }, price: 25, stockStatus: "in_stock" },
      { sourceVariantId: "v9b", title: "Alb", options: { color: "Alb" }, price: 25, stockStatus: "in_stock" },
    ],
  },
  {
    source: "aliexpress",
    sourceProductId: "ae-1005006012345",
    sourceUrl: "https://aliexpress.com/item/1005006012345.html",
    title: "Aparat Masaj Cervical Electric TENS, 6 Moduri",
    description: "Aparat de masaj pentru gât cu tehnologie TENS, 6 moduri, 15 nivele de intensitate, USB-C reîncărcabil, design ultraușor 50g, electrod 3D pentru relaxare musculară profundă.",
    price: 48,
    shipping: 0,
    currency: "RON",
    rating: 4.7,
    orders: 15600,
    deliveryDays: 14,
    images: [
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=400&h=400&fit=crop",
    ],
    category: "fitness",
    variants: [
      { sourceVariantId: "v10a", title: "Alb", options: { color: "Alb" }, price: 48, stockStatus: "in_stock" },
    ],
  },
];

/**
 * Smart bilingual search — understands Romanian and English
 */
export function mockSearch(query: string): SupplierProduct[] {
  if (!query || !query.trim()) return MOCK_PRODUCTS;

  const q = query.toLowerCase().trim();
  const inputWords = q.split(/\s+/);

  // Expand Romanian keywords to English equivalents
  const expandedTerms = new Set<string>();
  for (const word of inputWords) {
    expandedTerms.add(word);
    // Check RO→EN mapping
    for (const [roKey, enValues] of Object.entries(RO_KEYWORDS)) {
      if (word.includes(roKey) || roKey.includes(word)) {
        enValues.forEach((v) => expandedTerms.add(v));
      }
    }
  }

  const allTerms = Array.from(expandedTerms);

  const scored = MOCK_PRODUCTS.map((product) => {
    const text = `${product.title} ${product.description} ${product.category}`.toLowerCase();
    let score = 0;

    for (const term of allTerms) {
      // Exact match in title = highest score
      if (product.title.toLowerCase().includes(term)) score += 5;
      // Match in description
      if (product.description.toLowerCase().includes(term)) score += 2;
      // Match in category
      if (product.category.toLowerCase().includes(term)) score += 3;
      // Partial match (first 3 chars)
      if (term.length >= 3 && text.includes(term.slice(0, 3))) score += 1;
    }

    return { product, score };
  });

  const results = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Return matched products, or top 4 if nothing matches
  return results.length > 0
    ? results.map((r) => r.product)
    : MOCK_PRODUCTS.slice(0, 4);
}
