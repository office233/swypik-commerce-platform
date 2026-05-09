/**
 * Shared Cart types used across ChatInterface and ProductPage.
 * 
 * Key design decisions:
 * - Cart key is `${pgId}:${skuId || "base"}` to properly separate variants
 * - Snapshots (title, image, price) are stored for UI only — never sent to checkout
 * - Checkout only sends pgId + skuId + quantity (server resolves everything)
 */

import type { Product } from "./product";

/** Stored in localStorage as aicv_cart */
export type CartItem = {
  product: Product;
  qty: number;
};

/** Build unique cart key for variant deduplication */
export function cartItemKey(item: CartItem): string {
  return `${item.product.pgId || item.product.id}:${item.product.skuId || "base"}`;
}

/** Checkout payload — only these fields are sent to /api/cart */
export type CheckoutPayload = {
  products: Array<{
    pgId: number;
    skuId?: string;
    quantity: number;
  }>;
};

/** Build checkout payload from cart items */
export function buildCheckoutPayload(items: CartItem[]): CheckoutPayload {
  return {
    products: items.map((item) => ({
      pgId: item.product.pgId!,
      skuId: item.product.skuId || undefined,
      quantity: item.qty,
    })),
  };
}

/** Merge a product into existing cart, properly handling variant keys */
export function mergeIntoCart(cart: CartItem[], product: Product, quantity: number = 1): CartItem[] {
  const newKey = `${product.pgId || product.id}:${product.skuId || "base"}`;
  const idx = cart.findIndex((item) => cartItemKey(item) === newKey);
  if (idx >= 0) {
    const next = [...cart];
    next[idx] = { ...next[idx], qty: Math.min(10, next[idx].qty + quantity) };
    return next;
  }
  return [...cart, { product, qty: Math.min(10, quantity) }];
}
