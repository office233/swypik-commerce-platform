// Stub FX table — Sprint 1 folosește rate fixe.
// Sprint următor: cron daily care populează DB (`fx_rates`) din ECB/openexchangerates.
// Toate ratele = 1 RON -> X TARGET.

import type { Currency } from "./config";

export const FX_BASE: Currency = "RON";

export const FX_RATES: Record<Currency, number> = {
  RON: 1,
  EUR: 0.2, // 1 RON ≈ 0.20 EUR (5 RON / EUR)
  USD: 0.22,
  GBP: 0.17,
};

export function convertCents(
  amountCents: number,
  fromCurrency: Currency,
  toCurrency: Currency,
): number {
  if (fromCurrency === toCurrency) return amountCents;
  // 1) convert from -> RON (base)
  const fromRate = FX_RATES[fromCurrency];
  const toRate = FX_RATES[toCurrency];
  if (!fromRate || !toRate) return amountCents;
  const baseCents = amountCents / fromRate;
  return Math.round(baseCents * toRate);
}
