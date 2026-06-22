/**
 * Pi cart quote — server-side authoritative pricing for Pi payments.
 *
 * Converts a client-submitted cart (productId + quantity + optional skuId)
 * into:
 *   - amountRonCents  : the true total in RON cents (prices ALWAYS read from DB)
 *   - amountPi        : that total converted to Pi at the current rate
 *   - piToRonRate     : the rate used (1 Pi = X RON), snapshotted for the order
 *   - normalizedItems : sanitized {productId, qty, unitCents} for the order
 *
 * The Pi/RON rate:
 *   The merchant prices in RON; we charge in Pi at the real, live market
 *   rate pulled from CoinGecko (cached in Redis). See lib/pi/rate.ts.
 */

import { getCheckoutProductById } from "@/lib/db/product-queries";
import { getPiToRonRate } from "@/lib/pi/rate";

export type PiCartInput = Array<{
  productId: unknown;
  quantity?: unknown;
  skuId?: unknown;
}>;

export type PiQuote = {
  amountRonCents: number;
  amountPi: number;
  piToRonRate: number;
  normalizedItems: Array<{ productId: string; qty: number; unitCents: number }>;
};

function clampQty(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 10) return 10;
  return n;
}

export async function computePiCartQuote(items: PiCartInput): Promise<PiQuote> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("empty cart");
  }
  if (items.length > 10) {
    throw new Error("too many items");
  }

  const piToRonRate = await getPiToRonRate();
  let amountRonCents = 0;
  const normalizedItems: PiQuote["normalizedItems"] = [];

  for (const item of items) {
    const productId = String(item.productId || "").trim();
    if (!productId || productId === "undefined" || productId === "null") {
      throw new Error("invalid productId");
    }
    const qty = clampQty(item.quantity);

    // ALWAYS read price from DB — never trust client.
    const product = await getCheckoutProductById(productId);
    if (!product) {
      throw new Error(`product ${productId} not found`);
    }

    const unitCents = Math.round(Number(product.price) * 100);
    if (!Number.isFinite(unitCents) || unitCents <= 0) {
      throw new Error(`product ${productId} has no valid price`);
    }

    amountRonCents += unitCents * qty;
    normalizedItems.push({ productId, qty, unitCents });
  }

  // RON -> Pi. Round to 7 decimals (Pi's max precision).
  const amountPi =
    Math.round((amountRonCents / 100 / piToRonRate) * 1e7) / 1e7;

  return { amountRonCents, amountPi, piToRonRate, normalizedItems };
}
