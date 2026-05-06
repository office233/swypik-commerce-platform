/**
 * Pricing Engine v2 — Ultra-Competitive for Romanian Market
 * Strategy: Beat AliExpress prices while keeping 20-30% margin
 * "Temu pricing" — cheap enough to impulse buy, profitable at volume
 */

export type PricingResult = {
  sellPrice: number;
  oldPrice: number;
  margin: number;
  marginPercent: number;
  discountPercent: number;
  shippingIncluded: number;
};

// ─── Shipping estimate based on weight ────────────────────────────────
export function estimateShipping(weightKg: number, source: string = "otapi"): number {
  if (source === "cj") return 25; // CJ has flat shipping

  // OTAPI/1688 — ePacket rates to Romania
  if (weightKg <= 0.1) return 7;
  if (weightKg <= 0.3) return 10;
  if (weightKg <= 0.5) return 14;
  if (weightKg <= 1.0) return 20;
  if (weightKg <= 2.0) return 30;
  return 45;
}

/**
 * Calculate ultra-competitive sell price
 * Strategy: 20-32% markup (NOT 60%!)
 * Transport INCLUS in preț — client vede 1 preț final
 */
export function calculatePricing(
  costPrice: number,
  shippingCost: number = 0,
  category: string = "default"
): PricingResult {
  const totalCost = costPrice + shippingCost;

  // Tiered markup — aggressive but profitable
  let markup: number;
  if (totalCost < 15) markup = 1.35;       // very cheap: 35%
  else if (totalCost < 30) markup = 1.30;  // cheap items: 30%
  else if (totalCost < 60) markup = 1.28;  // mid items: 28%
  else if (totalCost < 120) markup = 1.25; // premium: 25%
  else if (totalCost < 300) markup = 1.22; // expensive: 22%
  else markup = 1.20;                       // luxury: 20%

  const rawPrice = totalCost * markup;

  // Psychological pricing: snap to X9 price points
  const pricePoints = [19, 29, 39, 49, 59, 69, 79, 89, 99, 119, 129, 149, 169, 199, 249, 299, 349, 399, 499];
  let sellPrice = pricePoints.find(p => p >= rawPrice) || Math.ceil(rawPrice / 50) * 50 - 1;

  // Safety: never sell below cost
  if (sellPrice <= totalCost) {
    sellPrice = Math.ceil(totalCost * 1.22 / 10) * 10 - 1;
  }

  // "Was" price — typical Romanian retail markup (60-100% more)
  const retailMarkup = 1.6 + Math.random() * 0.3;
  const oldPrice = Math.ceil(sellPrice * retailMarkup / 10) * 10 - 1;

  const margin = sellPrice - totalCost;
  const marginPercent = Math.round((margin / sellPrice) * 100);
  const discountPercent = Math.round(((oldPrice - sellPrice) / oldPrice) * 100);

  return {
    sellPrice,
    oldPrice,
    margin,
    marginPercent,
    discountPercent,
    shippingIncluded: shippingCost,
  };
}

/**
 * Quick price check - returns true if margin is acceptable
 */
export function hasGoodMargin(costPrice: number, sellPrice: number, minMarginPercent = 18): boolean {
  const margin = ((sellPrice - costPrice) / sellPrice) * 100;
  return margin >= minMarginPercent;
}
