/**
 * GET  /api/cart            → returns active cart for user (auth) or anon (cookie).
 * POST /api/cart/items      → handled by /items route.
 * DELETE /api/cart          → clear all items in active cart.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { buildCartCookie, getOrCreateCart, loadCartItems } from "@/lib/cart/session";

const NO_STORE = { "Cache-Control": "private, no-store" } as Record<string, string>;

export async function GET() {
  const cart = await getOrCreateCart({ create: true });
  if (!cart) {
    return NextResponse.json({ items: [], subtotalCents: 0, currency: "RON" }, { headers: NO_STORE });
  }
  const items = await loadCartItems(cart.cartId);
  const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const res = NextResponse.json({ items, subtotalCents, currency: cart.currency }, { headers: NO_STORE });
  if (cart.anonToken && !cart.userId) {
    res.headers.append("Set-Cookie", buildCartCookie(cart.anonToken));
  }
  return res;
}

export async function DELETE() {
  const cart = await getOrCreateCart();
  if (cart) {
    await dbQuery(`DELETE FROM cart_items WHERE cart_id = $1`, [cart.cartId]);
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
