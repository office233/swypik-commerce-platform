export type RecommendationProduct = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  tags?: string;
  vendor?: string;
  sku?: string;
  price: number;
  images?: string[];
  rating?: number;
  orders?: number;
  qualityScore?: number;
  commerceScore?: number;
  discountPercent?: number;
  deliveryDays?: number;
};

export type RecommendationIntent = {
  query: string;
  normalizedQuery: string;
  categories: string[];
  includeTerms: string[];
  excludeTerms: string[];
  complementaryTerms: string[];
  maxPrice?: number;
  mode: "gift" | "budget" | "premium" | "fashion" | "beauty" | "home" | "tech" | "general";
};

function normalize(value = "") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const DOMAIN_RULES = [
  {
    mode: "fashion" as const,
    triggers: ["rochie", "rochii", "outfit", "haine", "tricou", "bluza", "pantaloni", "fusta", "fashion"],
    include: ["rochie", "rochii", "outfit", "haine", "tricou", "bluza", "pantaloni", "fusta", "fashion", "wear", "dress"],
    complement: ["geanta", "bijuterii", "colier", "cercei", "bratara", "pantofi", "sandale", "parfum"],
    exclude: ["bucatarie", "auto", "masina", "telefon", "cablu", "animal", "pet"],
  },
  {
    mode: "beauty" as const,
    triggers: ["beauty", "skincare", "machiaj", "makeup", "crema", "ser", "ten", "par", "cosmetice"],
    include: ["beauty", "skincare", "machiaj", "makeup", "crema", "ser", "cosmetic", "parfum", "ten", "par"],
    complement: ["organizer", "oglinda", "pensule", "beauty", "skincare", "cadou"],
    exclude: ["auto", "masina", "bucatarie", "telefon", "cablu"],
  },
  {
    mode: "home" as const,
    triggers: ["casa", "decor", "bucatarie", "organizare", "curatenie", "baie", "living"],
    include: ["casa", "home", "decor", "bucatarie", "organizare", "organizator", "baie", "living", "curatenie"],
    complement: ["organizator", "decor", "lumina", "bucatarie", "storage"],
    exclude: ["rochie", "machiaj", "telefon", "auto"],
  },
  {
    mode: "tech" as const,
    triggers: ["telefon", "casti", "gadget", "cablu", "incarcator", "smart", "usb"],
    include: ["telefon", "casti", "gadget", "cablu", "incarcator", "smart", "usb", "tech"],
    complement: ["cablu", "incarcator", "husa", "suport", "casti"],
    exclude: ["rochie", "beauty", "machiaj", "bucatarie"],
  },
  {
    mode: "gift" as const,
    triggers: ["cadou", "aniversare", "surpriza", "iubita", "mama", "sotie", "prietena"],
    include: ["cadou", "gift", "bijuterii", "beauty", "parfum", "decor", "premium", "set"],
    complement: ["bijuterii", "beauty", "parfum", "set", "cutie", "premium"],
    exclude: ["piesa", "service", "auto", "industrial"],
  },
];

export function parseRecommendationIntent(query: string, maxPrice?: number): RecommendationIntent {
  const normalizedQuery = normalize(query);
  const matched = DOMAIN_RULES.filter((rule) => rule.triggers.some((term) => normalizedQuery.includes(normalize(term))));
  const primary = matched[0];
  const explicitBudget = normalizedQuery.match(/(?:sub|maxim|pana la)\s*(\d{2,5})/) || normalizedQuery.match(/(\d{2,5})\s*(?:lei|ron)/);
  const resolvedMaxPrice = maxPrice ?? (explicitBudget?.[1] ? Number(explicitBudget[1]) : undefined);
  const mode = normalizedQuery.includes("ieftin") || normalizedQuery.includes("buget") || normalizedQuery.includes("sub") ? "budget" : primary?.mode || "general";

  return {
    query,
    normalizedQuery,
    categories: matched.map((rule) => rule.mode),
    includeTerms: Array.from(new Set(matched.flatMap((rule) => rule.include).concat(normalizedQuery.split(/\s+/).filter((t) => t.length > 2)))),
    excludeTerms: Array.from(new Set(matched.flatMap((rule) => rule.exclude))),
    complementaryTerms: Array.from(new Set(matched.flatMap((rule) => rule.complement))),
    maxPrice: resolvedMaxPrice,
    mode,
  };
}

function productText(product: RecommendationProduct) {
  return normalize(`${product.title} ${product.description || ""} ${product.category || ""} ${product.tags || ""} ${product.vendor || ""} ${product.sku || ""}`);
}

export function scoreRecommendation(product: RecommendationProduct, intent: RecommendationIntent) {
  const text = productText(product);
  let score = 0;
  const reasons: string[] = [];

  for (const term of intent.includeTerms) {
    const t = normalize(term);
    if (!t) continue;
    if (text.includes(t)) {
      score += 10;
      reasons.push(`match:${term}`);
    }
  }

  for (const term of intent.excludeTerms) {
    const t = normalize(term);
    if (t && text.includes(t)) {
      score -= 35;
      reasons.push(`exclude:${term}`);
    }
  }

  if (intent.maxPrice != null) {
    if (product.price <= intent.maxPrice) {
      score += 18;
      reasons.push(`price<=${intent.maxPrice}`);
    } else {
      score -= 80;
      reasons.push(`price>${intent.maxPrice}`);
    }
  }

  if ((product.images?.length || 0) > 0) score += 8;
  else { score -= 25; reasons.push("missing-image"); }

  score += Math.min(product.commerceScore || 0, 40);
  score += Math.min((product.orders || 0) / 25, 20);
  score += Math.min((product.qualityScore || 7) * 1.5, 18);
  score += Math.min(product.discountPercent || 0, 15);
  score += Math.max(0, 6 - (product.deliveryDays || 6));

  if (intent.mode === "budget" && product.price <= (intent.maxPrice || 120)) score += 12;
  if (intent.mode === "premium" && product.price >= 150) score += 8;

  return { score: Math.round(score), reasons };
}

export function recommendProducts<T extends RecommendationProduct>(products: T[], query: string, options: { maxPrice?: number; limit?: number; debug?: boolean } = {}) {
  const intent = parseRecommendationIntent(query, options.maxPrice);
  const ranked = products
    .map((product) => {
      const scored = scoreRecommendation(product, intent);
      return { product, score: scored.score, reasons: scored.reasons };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 16);

  return {
    intent,
    products: ranked.map((entry) => options.debug ? { ...entry.product, recommendationScore: entry.score, recommendationReasons: entry.reasons } : { ...entry.product, recommendationScore: entry.score }),
    debug: ranked.map((entry) => ({ id: entry.product.id, title: entry.product.title, score: entry.score, reasons: entry.reasons })),
  };
}

export function recommendComplements<T extends RecommendationProduct>(products: T[], mainProducts: T[], query: string, options: { maxPrice?: number; limit?: number; debug?: boolean } = {}) {
  const baseIntent = parseRecommendationIntent(query, options.maxPrice);
  const complementQuery = baseIntent.complementaryTerms.join(" ") || query;
  const result = recommendProducts(products.filter((p) => !mainProducts.some((m) => m.id === p.id)), complementQuery, { ...options, limit: options.limit || 12 });
  return result;
}
