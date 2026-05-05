/**
 * Pricing Engine — Smart dynamic pricing
 * Calculates sell price based on cost, category, and market rules
 */

export type PricingResult = {
  sellPrice: number;
  oldPrice: number;
  margin: number;
  marginPercent: number;
  discountPercent: number;
};

const CATEGORY_MARKUP: Record<string, number> = {
  tech: 2.2,
  beauty: 2.8,
  fitness: 2.5,
  auto: 2.3,
  casa: 2.4,
  fashion: 2.6,
  gadgets: 2.5,
  default: 2.2,
};

export function calculatePricing(
  costPrice: number,
  shippingCost: number = 0,
  category: string = "default"
): PricingResult {
  const totalCost = costPrice + shippingCost + 5; // 5 lei risk buffer

  // Tiered markup based on cost
  let baseMarkup: number;
  if (totalCost < 30) baseMarkup = 3.2;
  else if (totalCost < 80) baseMarkup = 2.6;
  else if (totalCost < 150) baseMarkup = 2.2;
  else if (totalCost < 300) baseMarkup = 1.8;
  else baseMarkup = 1.5;

  // Category adjustment
  const catKey = category.toLowerCase();
  const categoryMultiplier = CATEGORY_MARKUP[catKey] || CATEGORY_MARKUP.default;
  const markup = (baseMarkup + categoryMultiplier) / 2; // average of both

  const rawPrice = totalCost * markup;
  const withVat = rawPrice * 1.21; // TVA Romania 21%

  // Psychological pricing: round to X9
  const sellPrice = Math.ceil(withVat / 10) * 10 - 1;

  // Old price: 30-45% higher for perceived discount
  const discountPercent = Math.round(Math.random() * 15 + 30);
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
export function hasGoodMargin(costPrice: number, sellPrice: number, minMarginPercent = 30): boolean {
  const margin = ((sellPrice - costPrice) / sellPrice) * 100;
  return margin >= minMarginPercent;
}
