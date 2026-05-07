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
 * Calculate competitive sell price — MARKUP DIFERENȚIAT
 * Sub $3 cost:   2.0x → protecție retururi
 * $3-50 cost:    1.5x → cel mai ieftin din România
 * $50+ cost:     1.3x → atrage clienți pe produse mari
 * Transport INCLUS in preț — client vede 1 preț final
 */
export function calculatePricing(
  costPrice: number,
  shippingCost: number = 0,
  category: string = "default"
): PricingResult {
  const totalCost = costPrice + shippingCost;

  // Differentiated markup based on product cost USD tier
  // costPrice is in RON here, convert thresholds accordingly
  // Sub $3 ≈ sub 14 RON total, $3-10 ≈ 14-68 RON, $10-50 ≈ 68-248 RON, $50+ ≈ 248+ RON
  let markup: number;
  if (totalCost < 14) markup = 2.0;        // sub $3: 2.0x — protecție retururi
  else if (totalCost < 68) markup = 1.5;   // $3-10: 1.5x — competitiv cu eMAG
  else if (totalCost < 248) markup = 1.5;  // $10-50: 1.5x — cel mai bun preț
  else markup = 1.3;                        // $50+: 1.3x — atrage clienți

  const rawPrice = totalCost * markup;

  // Psychological pricing: snap to X9 price points
  const pricePoints = [14, 19, 24, 29, 39, 49, 59, 69, 79, 89, 99, 119, 129, 149, 169, 199, 249, 299, 349, 399, 499];
  let sellPrice = pricePoints.find(p => p >= rawPrice) || Math.ceil(rawPrice / 50) * 50 - 1;

  // Safety: never sell below cost + 20%
  if (sellPrice <= totalCost * 1.2) {
    sellPrice = pricePoints.find(p => p >= totalCost * 1.3) || Math.ceil(totalCost * 1.3 / 10) * 10 - 1;
  }

  // "Was" price — eMAG-like retail markup (60-90% more)
  const retailMarkup = 1.6 + (Math.abs(Math.sin(costPrice * 137.5)) * 0.3);
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
