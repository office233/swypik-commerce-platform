/**
 * Pi cart quote ??? server-side authoritative pricing for Pi payments.
 *
 * Converts a client-submitted cart (productId + quantity + optional skuId,
 * creatorId, videoId, creatorProductLinkId) into a fully-fledged snapshot the
 * /complete endpoint can use to mirror Stripe's commerce_order_items writes
 * (title, seller_id, creator attribution, currency).
 *
 * Returned shape:
 *   - amountRonCents  : the true total in RON cents (prices ALWAYS read from DB)
 *   - amountPi        : that total converted to Pi at the current rate
 *   - piToRonRate     : the rate used (1 Pi = X RON), snapshotted for the order
 *   - currency        : always "RON" (single-source-of-truth for Pi orders)
 *   - normalizedItems : per-line snapshot used to build commerce_order_items
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
  // Optional creator/video attribution, mirrors Stripe checkout payload.
  creatorId?: unknown;
  videoId?: unknown;
  creatorProductLinkId?: unknown;
}>;

export type PiQuoteItem = {
  productId: string;
  qty: number;
  unitCents: number;
  // Snapshot fields used to write commerce_order_items just like Stripe does.
  title: string;
  sellerId: string | null;
  creatorId: string | null;
  videoId: string | null;
  creatorProductLinkId: string | null;
  skuId: string | null;
  image: string | null;
};

export type PiQuote = {
  amountRonCents: number;
  amountPi: number;
  piToRonRate: number;
  currency: "RON";
  normalizedItems: PiQuoteItem[];
};

function clampQty(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 10) return 10;
  return n;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s === "undefined" || s === "null") return null;
  return s;
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
  const normalizedItems: PiQuoteItem[] = [];

  for (const item of items) {
    const productId = String(item.productId || "").trim();
    if (!productId || productId === "undefined" || productId === "null") {
      throw new Error("invalid productId");
    }
    const qty = clampQty(item.quantity);

    // ALWAYS read price + title + seller from DB ??? never trust client.
    const product = await getCheckoutProductById(productId);
    if (!product) {
      throw new Error(`product ${productId} not found`);
    }

    const unitCents = Math.round(Number(product.price) * 100);
    if (!Number.isFinite(unitCents) || unitCents <= 0) {
      throw new Error(`product ${productId} has no valid price`);
    }

    amountRonCents += unitCents * qty;
    normalizedItems.push({
      productId,
      qty,
      unitCents,
      title:
        typeof product.title === "string" && product.title.trim()
          ? product.title.trim()
          : `Product ${productId}`,
      sellerId: strOrNull((product as { seller_id?: unknown }).seller_id),
      creatorId: strOrNull(item.creatorId),
      videoId: strOrNull(item.videoId),
      creatorProductLinkId: strOrNull(item.creatorProductLinkId),
      skuId: strOrNull(item.skuId),
      image:
        typeof (product as { image_url?: unknown }).image_url === "string"
          ? ((product as { image_url?: string }).image_url ?? null)
          : null,
    });
  }

  // RON -> Pi. Round to 7 decimals (Pi's max precision).
  const amountPi =
    Math.round((amountRonCents / 100 / piToRonRate) * 1e7) / 1e7;

  return {
    amountRonCents,
    amountPi,
    piToRonRate,
    currency: "RON",
    normalizedItems,
  };
}
