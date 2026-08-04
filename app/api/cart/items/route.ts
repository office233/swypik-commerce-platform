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
    // P2 audit 2026-08-03: pretul din body e DOAR fallback pentru produse
    // externe (fara rand in marketplace_products). Daca produsul exista in DB,
    // pretul DB il suprascrie mereu (mai jos) — dar inainte clientul putea
    // afisa subtotal manipulat cand lookup-ul esua. Marcam sursa pretului.
    let priceCents: number = body.priceCents ?? 0;
    let priceFromDb = false;
    let currency: string = (body.currency ?? cart.currency ?? "RON").toUpperCase();
    let image: string | null = body.image ?? null;
    let mpId: string | null = null;
    let mpVariantId: string | null = null;

    let productExistsInDb = false;
    try {
      const { rows } = await dbQuery<any>(
        `SELECT id, title, price_cents, currency, image_url, listing_type
         FROM marketplace_products WHERE id::text = $1 OR external_product_id = $1 LIMIT 1`,
        [productId],
      );
      if (rows[0]) {
        productExistsInDb = true;
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
        if (rows[0].price_cents != null) {
          // Pretul canonic vine intotdeauna din DB cand produsul exista —
          // ignoram body.priceCents (client-controlled).
          priceCents = Number(rows[0].price_cents);
          priceFromDb = true;
        }
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
          if (rows[0].price_cents != null) {
            priceCents = Number(rows[0].price_cents);
            priceFromDb = true;
          }
        }
      } catch { }
    }

    // Produs intern (UUID-like, fara prefix de sursa externa) inexistent in DB
    // => refuzam adaugarea. Inainte, un productId inventat intra ca "produs
    // fantoma" cu pret 0 si polua cosul (BUG-hunt 2026-08-04). Externe (AliExpress
    // etc., cu prefix `ae:`/`ext:` sau non-UUID) raman permise ca fallback.
    if (!productExistsInDb) {
      const looksInternal = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
      if (looksInternal) {
        return NextResponse.json(
          { success: false, error: "Produsul nu a fost găsit." },
          { status: 404, headers: NO_STORE },
        );
      }
    }

    if (!title) title = "Produs";
    if (!Number.isFinite(priceCents) || priceCents < 0) priceCents = 0;
    // Produs intern negasit in DB (lookup esuat) => nu acceptam pret din client.
    if (!priceFromDb && mpId === null && body.priceCents != null) priceCents = 0;

    const metadata = { mergeable: true, image };

    // Atomic UPSERT — se bazeaza pe indexul unic partial
    // cart_items_cart_external_variant_uidx (cart_id, external_product_id,
    // COALESCE(external_variant_id,'')) WHERE metadata->>'mergeable' = 'true'.
    // Folosirea ON CONFLICT ... DO UPDATE evita race condition-ul de "lost update"
    // cand acelasi produs e adaugat concurent (dublu-tap / mai multe taburi):
    // varianta veche SELECT+UPDATE pierdea incremente sub concurenta.
    const upsert = await dbQuery<{ id: string }>(
      `INSERT INTO cart_items
         (cart_id, external_product_id, external_variant_id, marketplace_product_id, marketplace_variant_id,
          title, quantity, currency, unit_amount_cents, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (cart_id, external_product_id, COALESCE(external_variant_id,''))
         WHERE (metadata->>'mergeable') = 'true'
       DO UPDATE SET
         quantity = LEAST(99, cart_items.quantity + EXCLUDED.quantity),
         updated_at = now()
       RETURNING id`,
      [cart.cartId, productId, variantId, mpId, mpVariantId, title, quantity, currency, priceCents, JSON.stringify(metadata)],
    );
    const itemId = upsert.rows[0].id;
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
