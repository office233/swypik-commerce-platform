export type BundleProduct = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  vendor?: string;
  price: number;
  oldPrice?: number;
  discountPercent?: number;
  qualityScore?: number;
  rating?: number;
  orders?: number;
  tags?: string;
  sku?: string;
};

const COMPLEMENTARY_TERMS: Record<string, string[]> = {
  rochie: ["geantă", "bijuterii", "colier", "cercei", "sandale", "parfum"],
  rochii: ["geantă", "bijuterii", "colier", "cercei", "sandale", "parfum"],
  geanta: ["portofel", "rochie", "bijuterii", "ochelari"],
  geantă: ["portofel", "rochie", "bijuterii", "ochelari"],
  bijuterii: ["rochie", "geantă", "parfum", "cutie cadou"],
  colier: ["cercei", "brățară", "rochie", "geantă"],
  beauty: ["ser", "cremă", "makeup", "organizer", "cadou"],
  skincare: ["ser", "cremă", "cleanser", "makeup", "organizer"],
  tricou: ["blugi", "hanorac", "șapcă", "ceas"],
  barbati: ["ceas", "portofel", "tricou", "hanorac"],
  bărbați: ["ceas", "portofel", "tricou", "hanorac"],
  casa: ["organizator", "lampă", "decor", "bucătărie"],
  casă: ["organizator", "lampă", "decor", "bucătărie"],
  cadou: ["bijuterii", "beauty", "parfum", "accesorii", "cutie cadou"],
};

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function includesAny(haystack: string, terms: string[]) {
  const normalized = normalize(haystack);
  return terms.some((term) => normalized.includes(normalize(term)));
}

export function inferBundleQueries(query: string): string[] {
  const normalized = normalize(query);
  const matches = Object.entries(COMPLEMENTARY_TERMS)
    .filter(([key]) => normalized.includes(normalize(key)))
    .flatMap(([, terms]) => terms);

  const unique = Array.from(new Set(matches));

  if (unique.length > 0) return unique.slice(0, 6);

  return [
    `${query} accesorii`,
    `${query} cadou`,
    `${query} premium`,
  ];
}

export function scoreProduct(product: BundleProduct) {
  const rating = product.rating || 4.6;
  const orders = product.orders || 0;
  const quality = product.qualityScore || 8;
  const discount = product.discountPercent || 0;
  const pricePenalty = product.price > 300 ? 0.3 : product.price > 150 ? 0.15 : 0;

  return quality * 2 + rating + Math.min(orders / 100, 5) + discount / 10 - pricePenalty;
}

export function rankProducts<T extends BundleProduct>(products: T[]) {
  return [...products].sort((a, b) => scoreProduct(b) - scoreProduct(a));
}

export function pickBundleProducts<T extends BundleProduct>(mainProduct: T, products: T[], limit = 6) {
  const source = `${mainProduct.title} ${mainProduct.description || ""} ${mainProduct.category || ""}`;
  const queries = inferBundleQueries(source);

  const candidates = products.filter((p) => {
    if (p.id === mainProduct.id) return false;
    const haystack = `${p.title} ${p.description || ""} ${p.category || ""} ${p.vendor || ""} ${p.sku || ""}`;
    return includesAny(haystack, queries);
  });

  return rankProducts(candidates).slice(0, limit);
}

export function buildSalesSuggestion(mainProduct: BundleProduct, bundleProducts: BundleProduct[]) {
  if (bundleProducts.length === 0) {
    return `Produsul ales merge bine singur, dar pot căuta și accesorii potrivite pentru el.`;
  }

  const bundleTotal = bundleProducts.slice(0, 2).reduce((sum, p) => sum + p.price, mainProduct.price);
  const names = bundleProducts.slice(0, 2).map((p) => p.title).join(" + ");

  return `Bundle recomandat: ${mainProduct.title} + ${names}. Total estimat: ${Math.round(bundleTotal)} lei. Îl poți transforma într-un pachet mai complet în loc să iei doar un produs.`;
}
