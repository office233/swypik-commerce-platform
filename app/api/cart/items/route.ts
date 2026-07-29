/**
 * POST /api/cart/items → upsert item into active cart.
 * Body: { productId, quantity?, variantId?, title?, image?, priceCents?, currency? }
 *
 * Server resolves canonical title/price/currency from marketplace_products if missing.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { buildCartCookie, getOrCreateCart, loadCartItems } from "@/lib/cart/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { CartItemAddSchema, parseBody } from "@/lib/validation/schemas";

const NO_STORE = { "Cache-Control": "private, no-store" } as Record<string, string>;

export async function POST(req: Request) {
  try {
    const rl = await rateLimit("cartItems", getClientIP(req));
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });

    const rawBody = await req.json().catch(() => ({}));
    const parsed = parseBody(CartItemAddSchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, issues: parsed.issues }, { status: 400, headers: NO_STORE });
    }
    const body = parsed.data;
    const productId = body.productId;
    const variantId = body.variantId ?? null;
    const quantity = body.quantity;

    const cart = await getOrCreateCart({ create: true });
    if (!cart) return NextResponse.json({ error: "cart_unavailable" }, { status: 500, headers: NO_STORE });

    // Resolve price/title from DB if not provided.
    let title: string = body.title ?? "";
    let priceCents: number = body.priceCents ?? 0;
    let currency: string = (body.currency ?? cart.currency ?? "RON").toUpperCase();
    let image: string | null = body.image ?? null;
    let mpId: string | null = null;
    let mpVariantId: string | null = null;

    try {
      const { rows } = await dbQuery<any>(
        `SELECT id, title, price_cents, currency, image_url, listing_type
         FROM marketplace_products WHERE id::text = $1 OR external_product_id = $1 LIMIT 1`,
        [productId],
      );
      if (rows[0]) {
        // Anunțurile (imobiliare/auto/servicii) nu se cumpără prin coș —
        // au formular de contact în loc de checkout.
        if (rows[0].listing_type === "listing") {
          return NextResponse.json(
            { success: false, error: "Acest anunț nu poate fi adăugat în coș. Folosește formularul de contact." },
            { status: 400 },
          );
        }
        mpId = rows[0].id;
        if (!title) title = rows[0].title;
        if (!priceCents && rows[0].price_cents) priceCents = Number(rows[0].price_cents);
        if (!image && rows[0].image_url) image = rows[0].image_url;
        currency = (rows[0].currency || currency).toUpperCase();
      }
    } catch { /* table shape may differ; ignore */ }

    if (variantId) {
      try {
        const { rows } = await dbQuery<any>(
          `SELECT id, price_cents FROM marketplace_product_variants
           WHERE id::text = $1 OR sku = $1 LIMIT 1`,
          [variantId],
        );
        if (rows[0]) {
          mpVariantId = rows[0].id;
          if (rows[0].price_cents) priceCents = Number(rows[0].price_cents);
        }
      } catch {}
    }

    if (!title) title = "Produs";
    if (!Number.isFinite(priceCents) || priceCents < 0) priceCents = 0;

    const metadata = { mergeable: true, image };

    // Try UPSERT (sum quantity if same product+variant exist).
    const { rows: existing } = await dbQuery<{ id: string; quantity: number }>(
      `SELECT id, quantity FROM cart_items
       WHERE cart_id = $1 AND external_product_id = $2
         AND COALESCE(external_variant_id,'') = COALESCE($3,'')
         AND (metadata->>'mergeable') = 'true'
       LIMIT 1`,
      [cart.cartId, productId, variantId],
    );
    let itemId: string;
    if (existing[0]) {
      const newQty = Math.min(99, existing[0].quantity + quantity);
      await dbQuery(
        `UPDATE cart_items SET quantity = $1, updated_at = now() WHERE id = $2`,
        [newQty, existing[0].id],
      );
      itemId = existing[0].id;
    } else {
      const ins = await dbQuery<{ id: string }>(
        `INSERT INTO cart_items
           (cart_id, external_product_id, external_variant_id, marketplace_product_id, marketplace_variant_id,
            title, quantity, currency, unit_amount_cents, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         RETURNING id`,
        [cart.cartId, productId, variantId, mpId, mpVariantId, title, quantity, currency, priceCents, JSON.stringify(metadata)],
      );
      itemId = ins.rows[0].id;
    }
    await dbQuery(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cart.cartId]);

    const items = await loadCartItems(cart.cartId);
    const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
    const res = NextResponse.json({ success: true, itemId, items, subtotalCents, currency: cart.currency }, { headers: NO_STORE });
    if (cart.anonToken && !cart.userId) {
      res.headers.append("Set-Cookie", buildCartCookie(cart.anonToken));
    }
    return res;
  } catch (err) {
    return NextResponse.json({ error: "cart_add_failed", message: (err as Error).message }, { status: 500, headers: NO_STORE });
  }
}
