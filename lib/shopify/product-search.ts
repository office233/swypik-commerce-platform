export type SearchProduct = {
  id: string;
  title: string;
  description?: string;
  benefits?: string[];
  price: number;
  oldPrice?: number;
  discountPercent?: number;
  rating?: number;
  orders?: number;
  deliveryDays?: number;
  images?: string[];
  category?: string;
  vendor?: string;
  sku?: string;
  tags?: string;
  handle?: string;
  variantId?: string;
  availableForSale?: boolean;
  inventoryQuantity?: number;
  qualityScore?: number;
  commerceScore?: number;
  cartAdds?: number;
  soldCount?: number;
  revenue?: number;
};

export type ProductSearchFilters = {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  category?: string;
  sort?: "recommended" | "price_asc" | "price_desc" | "popular" | "delivery" | "discount";
  requireImage?: boolean;
  limit?: number;
};

function normalize(value = "") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function parseSearchIntent(rawQuery = "") {
  const query = rawQuery.trim();
  const normalized = normalize(query);
  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  let sort: ProductSearchFilters["sort"] = "recommended";

  const underMatch = normalized.match(/(?:sub|pana la|maxim|under|below)\s*(\d{2,5})/i);
  const leiMatch = normalized.match(/(\d{2,5})\s*(?:lei|ron)/i);

  if (underMatch?.[1]) maxPrice = Number(underMatch[1]);
  else if ((normalized.includes("ieftin") || normalized.includes("buget")) && leiMatch?.[1]) maxPrice = Number(leiMatch[1]);
  else if (normalized.includes("sub 100")) maxPrice = 100;

  if (normalized.includes("ieftin") || normalized.includes("buget") || normalized.includes("sub")) sort = "price_asc";
  if (normalized.includes("premium") || normalized.includes("lux")) sort = "price_desc";
  if (normalized.includes("popular") || normalized.includes("best seller") || normalized.includes("bestseller")) sort = "popular";
  if (normalized.includes("reducere") || normalized.includes("discount") || normalized.includes("oferta")) sort = "discount";
  if (normalized.includes("rapid") || normalized.includes("livrare")) sort = "delivery";

  const cleanedQuery = query
    .replace(/(?:sub|pana la|maxim|under|below)\s*\d{2,5}/gi, "")
    .replace(/\d{2,5}\s*(lei|ron)/gi, "")
    .replace(/ieftin|buget|premium|lux|popular|bestseller|best seller|reducere|discount|oferta|rapid|livrare/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return { query: cleanedQuery || query, minPrice, maxPrice, sort };
}

function tokenScore(product: SearchProduct, terms: string[]) {
  if (terms.length === 0) return 0;
  const title = normalize(product.title);
  const category = normalize(product.category || "");
  const tags = normalize(product.tags || "");
  const desc = normalize(product.description || "");
  const vendor = normalize(product.vendor || "");
  const sku = normalize(product.sku || "");
  let score = 0;

  for (const term of terms) {
    const t = normalize(term);
    if (!t) continue;
    if (title.includes(t)) score += 12;
    if (category.includes(t)) score += 8;
    if (tags.includes(t)) score += 7;
    if (sku.includes(t)) score += 6;
    if (vendor.includes(t)) score += 3;
    if (desc.includes(t)) score += 2;
  }

  const exact = normalize(terms.join(" "));
  if (exact && title.includes(exact)) score += 20;
  return score;
}

function commerceScore(product: SearchProduct) {
  const quality = product.qualityScore || 7;
  const rating = product.rating || 4.5;
  const orders = product.orders || 0;
  const cartAdds = product.cartAdds || 0;
  const conversion = product.commerceScore || 0;
  const discount = product.discountPercent || 0;
  const delivery = product.deliveryDays ? Math.max(0, 6 - product.deliveryDays) : 0;

  return quality * 2 + rating * 2 + Math.min(orders / 80, 8) + Math.min(cartAdds / 10, 5) + Math.min(conversion / 8, 12) + discount / 8 + delivery;
}

function isAvailable(product: SearchProduct) {
  if (!product.variantId) return false;
  if (product.availableForSale === false) return false;
  if (typeof product.inventoryQuantity === "number" && product.inventoryQuantity <= 0) return false;
  return true;
}

export function searchProducts(products: SearchProduct[], filters: ProductSearchFilters) {
  const parsed = parseSearchIntent(filters.query || "");
  const query = filters.query ? parsed.query : "";
  const minPrice = filters.minPrice ?? parsed.minPrice;
  const maxPrice = filters.maxPrice ?? parsed.maxPrice;
  const sort = filters.sort || parsed.sort || "recommended";
  const limit = filters.limit || 24;
  const terms = normalize(query).split(/\s+/).filter(Boolean).filter((t) => t.length > 1);

  let result = products
    .filter((p) => Number.isFinite(p.price) && p.price > 0)
    .filter(isAvailable)
    .filter((p) => !filters.requireImage || (p.images?.length || 0) > 0)
    .filter((p) => minPrice == null || p.price >= minPrice)
    .filter((p) => maxPrice == null || p.price <= maxPrice)
    .filter((p) => !filters.category || normalize(p.category || "").includes(normalize(filters.category)))
    .map((product) => ({
      product,
      searchScore: tokenScore(product, terms),
      commerceScore: commerceScore(product),
    }))
    .filter((entry) => terms.length === 0 || entry.searchScore > 0);

  if (sort === "price_asc") result = result.sort((a, b) => a.product.price - b.product.price || b.searchScore - a.searchScore);
  else if (sort === "price_desc") result = result.sort((a, b) => b.product.price - a.product.price || b.searchScore - a.searchScore);
  else if (sort === "popular") result = result.sort((a, b) => (b.product.orders || 0) - (a.product.orders || 0) || b.commerceScore - a.commerceScore);
  else if (sort === "delivery") result = result.sort((a, b) => (a.product.deliveryDays || 99) - (b.product.deliveryDays || 99) || b.commerceScore - a.commerceScore);
  else if (sort === "discount") result = result.sort((a, b) => (b.product.discountPercent || 0) - (a.product.discountPercent || 0) || b.commerceScore - a.commerceScore);
  else result = result.sort((a, b) => (b.searchScore + b.commerceScore) - (a.searchScore + a.commerceScore));

  return {
    products: result.slice(0, limit).map((entry) => ({ ...entry.product, searchScore: entry.searchScore, recommendationScore: Math.round(entry.searchScore + entry.commerceScore) })),
    parsed,
    total: result.length,
  };
}

export function buildSuggestions(products: SearchProduct[], query: string, limit = 8) {
  const normalized = normalize(query);
  if (!normalized || normalized.length < 2) return [];

  const suggestions = new Map<string, { label: string; type: "product" | "category" | "tag"; score: number }>();

  for (const p of products.filter(isAvailable)) {
    const title = p.title || "";
    const category = p.category || "";
    if (normalize(title).includes(normalized)) suggestions.set(`product:${title}`, { label: title, type: "product", score: 10 + commerceScore(p) });
    if (category && normalize(category).includes(normalized)) suggestions.set(`category:${category}`, { label: category, type: "category", score: 8 });
    for (const tag of String(p.tags || "").split(",").map((t) => t.trim()).filter(Boolean)) {
      if (normalize(tag).includes(normalized)) suggestions.set(`tag:${tag}`, { label: tag, type: "tag", score: 6 });
    }
  }

  return Array.from(suggestions.values()).sort((a, b) => b.score - a.score).slice(0, limit);
}
