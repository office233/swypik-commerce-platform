/**
 * Pricing Engine — Competitive pricing for Romanian market
 * Goal: Be CHEAPER than local stores while maintaining healthy margin
 * AliExpress products already include VAT in EUR price
 */

export type PricingResult = {
  sellPrice: number;
  oldPrice: number;
  margin: number;
  marginPercent: number;
  discountPercent: number;
};

/**
 * Calculate competitive sell price
 * Strategy: 30-50% markup over cost (not 200%+!)
 * This keeps prices WELL BELOW Romanian retail while ensuring profit
 */
export function calculatePricing(
  costPrice: number,
  shippingCost: number = 0,
  category: string = "default"
): PricingResult {
  const totalCost = costPrice + shippingCost;

  // Tiered markup — lower markup for expensive items
  let markup: number;
  if (totalCost < 25) markup = 1.6;       // cheap items: 60% markup
  else if (totalCost < 60) markup = 1.45;  // mid items: 45% markup
  else if (totalCost < 120) markup = 1.35; // premium: 35% markup
  else if (totalCost < 300) markup = 1.28; // expensive: 28% markup
  else markup = 1.22;                       // luxury: 22% markup

  const rawPrice = totalCost * markup;

  // Psychological pricing: round to X9
  const sellPrice = Math.ceil(rawPrice / 10) * 10 - 1;

  // Old price: show 15-25% "discount" (based on typical Romanian retail price)
  const discountPercent = Math.round(Math.random() * 10 + 15);
  const oldPrice = Math.ceil((sellPrice / (1 - discountPercent / 100)) / 10) * 10 - 1;

  const margin = sellPrice - totalCost;
  const marginPercent = Math.round((margin / sellPrice) * 100);

  return {
    sellPrice,
    oldPrice,
    margin,
    marginPercent,
    discountPercent,
  };
}

/**
 * Quick price check - returns true if margin is acceptable
 */
export function hasGoodMargin(costPrice: number, sellPrice: number, minMarginPercent = 20): boolean {
  const margin = ((sellPrice - costPrice) / sellPrice) * 100;
  return margin >= minMarginPercent;
}
