/**
 * Safety Filter — Blocks risky/dangerous products
 * Ensures only safe, quality products are shown to customers
 */

import { SupplierProduct } from "../types";

// Blocked categories and keywords
const BLOCKED_KEYWORDS = [
  // Weapons
  "gun", "pistol", "knife", "weapon", "switchblade", "sword", "arma",
  // Fake brands
  "replica", "fake", "copy", "imitation",
  // Medical with false claims
  "cure", "cancer", "diabetes", "tratament", "medicament", "pill",
  // Dangerous
  "explosive", "lighter fluid", "taser", "pepper spray",
  // Adult content
  "adult", "18+", "xxx",
];

const BLOCKED_CATEGORIES = [
  "weapons", "medications", "supplements_unverified", "tobacco",
  "adult", "gambling", "counterfeit",
];

// Known fake brand patterns
const FAKE_BRAND_PATTERNS = [
  /n[i1]ke/i, /ad[i1]das/i, /gu[c]c[i1]/i, /lou[i1]s.?vu[i1]tton/i,
  /ch[a4]nel/i, /pr[a4]d[a4]/i, /r[o0]lex/i, /supreme/i,
  /y[e3][e3]zy/i, /balen[c]iaga/i,
];

export type FilterResult = {
  passed: boolean;
  reason?: string;
  score: number; // 0-10 quality score
};

export function safetyCheck(product: SupplierProduct): FilterResult {
  const titleLower = (product.title || "").toLowerCase();
  const descLower = (product.description || "").toLowerCase();
  const fullText = `${titleLower} ${descLower}`;

  // Check blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (fullText.includes(keyword)) {
      return { passed: false, reason: `Cuvânt blocat: "${keyword}"`, score: 0 };
    }
  }

  // Check fake brands
  for (const pattern of FAKE_BRAND_PATTERNS) {
    if (pattern.test(fullText)) {
      return { passed: false, reason: "Posibil brand fals/contrafăcut", score: 0 };
    }
  }

  // Check blocked categories
  if (BLOCKED_CATEGORIES.includes(product.category?.toLowerCase())) {
    return { passed: false, reason: `Categorie blocată: ${product.category}`, score: 0 };
  }

  // Quality checks
  if (product.rating < 4.5) {
    return { passed: false, reason: `Rating prea mic: ${product.rating}`, score: 2 };
  }

  if (product.orders < 50) {
    return { passed: false, reason: `Prea puține comenzi: ${product.orders}`, score: 3 };
  }

  if (product.deliveryDays > 30) {
    return { passed: false, reason: `Livrare prea lentă: ${product.deliveryDays} zile`, score: 2 };
  }

  if (!product.images || product.images.length === 0 || product.images.every((i) => !i)) {
    return { passed: false, reason: "Fără imagini", score: 1 };
  }

  // Calculate quality score
  let score = 5;

  // Rating bonus
  if (product.rating >= 4.9) score += 2;
  else if (product.rating >= 4.7) score += 1;

  // Orders bonus
  if (product.orders >= 1000) score += 1.5;
  else if (product.orders >= 500) score += 1;
  else if (product.orders >= 200) score += 0.5;

  // Fast delivery bonus
  if (product.deliveryDays <= 10) score += 1;
  else if (product.deliveryDays <= 15) score += 0.5;

  // Multiple images bonus
  if (product.images.filter((i) => !!i).length >= 3) score += 0.5;

  score = Math.min(10, Math.round(score * 10) / 10);

  return { passed: true, score };
}

export function filterAndScoreProducts(products: SupplierProduct[]) {
  return products
    .map((product) => {
      const result = safetyCheck(product);
      return { product, ...result };
    })
    .filter((r) => r.passed)
    .sort((a, b) => b.score - a.score);
}
