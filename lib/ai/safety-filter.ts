/**
 * Safety Filter — Blocks risky/dangerous products and tags adult content.
 *
 * Adult products are NOT blocked anymore. They pass through with `isAdult=true`
 * and an `adultReason` so the import pipeline can persist `is_adult=true` on the
 * product/video/category. Adult content is then gated by age verification at
 * query/feed time (see user_age_verifications table + middleware).
 */

import { SupplierProduct } from "../types";

// Hard-blocked content (never enters the catalog)
const BLOCKED_KEYWORDS = [
  // Weapons
  "gun", "pistol", "knife", "weapon", "switchblade", "sword", "arma",
  // Fake brands
  "replica", "fake", "copy", "imitation",
  // Medical with false claims
  "cure", "cancer", "diabetes", "tratament", "medicament", "pill",
  // Dangerous
  "explosive", "lighter fluid", "taser", "pepper spray",
];

const BLOCKED_CATEGORIES = [
  "weapons", "medications", "supplements_unverified", "tobacco",
  "gambling", "counterfeit",
];

// Adult content (allowed but gated)
const ADULT_KEYWORDS = [
  "18+", "xxx", "sex toy", "vibrator", "dildo", "anal", "masturbator",
  "fleshlight", "bondage", "bdsm", "butt plug", "cock ring", "vibrating egg",
  "g-spot", "penis ring", "lubricant sex", "adult only", "adult-only",
];

const ADULT_CATEGORIES = [
  "adult", "adult sex toys", "sex products", "intimates & sex toys",
  "sexy lingerie sets",
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
  isAdult: boolean;
  adultReason?: string;
};

function detectAdult(fullText: string, category?: string): { isAdult: boolean; reason?: string } {
  const cat = (category || "").toLowerCase().trim();
  if (cat && ADULT_CATEGORIES.some((c) => cat === c || cat.includes(c))) {
    return { isAdult: true, reason: `category:${cat}` };
  }
  for (const kw of ADULT_KEYWORDS) {
    if (fullText.includes(kw)) {
      return { isAdult: true, reason: `keyword:${kw}` };
    }
  }
  return { isAdult: false };
}

export function safetyCheck(product: SupplierProduct): FilterResult {
  const titleLower = (product.title || "").toLowerCase();
  const descLower = (product.description || "").toLowerCase();
  const fullText = `${titleLower} ${descLower}`;

  // Hard-block keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (fullText.includes(keyword)) {
      return { passed: false, reason: `Cuvânt blocat: "${keyword}"`, score: 0, isAdult: false };
    }
  }

  // Fake brands
  for (const pattern of FAKE_BRAND_PATTERNS) {
    if (pattern.test(fullText)) {
      return { passed: false, reason: "Posibil brand fals/contrafăcut", score: 0, isAdult: false };
    }
  }

  // Hard-block categories
  if (BLOCKED_CATEGORIES.includes(product.category?.toLowerCase())) {
    return { passed: false, reason: `Categorie blocată: ${product.category}`, score: 0, isAdult: false };
  }

  // Adult detection (does NOT block — flags for age-gating)
  const adult = detectAdult(fullText, product.category);

  // Quality checks — 0 means data not available (e.g. CJ products)
  if (product.rating > 0 && product.rating < 3.0) {
    return { passed: false, reason: `Rating prea mic: ${product.rating}`, score: 2, isAdult: adult.isAdult, adultReason: adult.reason };
  }

  if (product.deliveryDays > 30) {
    return { passed: false, reason: `Livrare prea lentă: ${product.deliveryDays} zile`, score: 2, isAdult: adult.isAdult, adultReason: adult.reason };
  }

  if (!product.images || product.images.length === 0 || product.images.every((i) => !i)) {
    return { passed: false, reason: "Fără imagini", score: 1, isAdult: adult.isAdult, adultReason: adult.reason };
  }

  // Calculate quality score
  let score = 5;

  if (product.rating >= 4.9) score += 2;
  else if (product.rating >= 4.7) score += 1;

  if (product.orders >= 1000) score += 1.5;
  else if (product.orders >= 500) score += 1;
  else if (product.orders >= 200) score += 0.5;

  if (product.deliveryDays <= 10) score += 1;
  else if (product.deliveryDays <= 15) score += 0.5;

  if (product.images.filter((i) => !!i).length >= 3) score += 0.5;

  score = Math.min(10, Math.round(score * 10) / 10);

  return { passed: true, score, isAdult: adult.isAdult, adultReason: adult.reason };
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
