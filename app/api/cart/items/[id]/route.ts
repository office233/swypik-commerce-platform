/**
 * PATCH /api/cart/items/[id]  body { quantity }
 * DELETE /api/cart/items/[id]
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOrCreateCart, loadCartItems } from "@/lib/cart/session";
import { CartItemPatchSchema, parseBody } from "@/lib/validation/schemas";

const NO_STORE = { "Cache-Control": "private, no-store" } as Record<string, string>;

async function ownItem(cartId: string, itemId: string): Promise<boolean> {
  const { rows } = await dbQuery(`SELECT 1 FROM cart_items WHERE id = $1 AND cart_id = $2 LIMIT 1`, [itemId, cartId]);
  return rows.length > 0;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cart = await getOrCreateCart();
  if (!cart) return NextResponse.json({ error: "no_cart" }, { status: 404, headers: NO_STORE });
  if (!(await ownItem(cart.cartId, id))) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(CartItemPatchSchema, rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, issues: parsed.issues }, { status: 400, headers: NO_STORE });
  }
  const quantity = parsed.data.quantity;
  if (quantity === 0) {
    await dbQuery(`DELETE FROM cart_items WHERE id = $1`, [id]);
  } else {
    await dbQuery(`UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2`, [quantity, id]);
  }
  const items = await loadCartItems(cart.cartId);
  const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  return NextResponse.json({ success: true, items, subtotalCents, currency: cart.currency }, { headers: NO_STORE });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cart = await getOrCreateCart();
  if (!cart) return NextResponse.json({ error: "no_cart" }, { status: 404, headers: NO_STORE });
  if (!(await ownItem(cart.cartId, id))) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  await dbQuery(`DELETE FROM cart_items WHERE id = $1`, [id]);
  const items = await loadCartItems(cart.cartId);
  const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  return NextResponse.json({ success: true, items, subtotalCents, currency: cart.currency }, { headers: NO_STORE });
}
