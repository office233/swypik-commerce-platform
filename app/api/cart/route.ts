/**
 * Cart API v3 — Secure Server-Authoritative Checkout
 * 
 * SECURITY: Client sends ONLY pgId, quantity, skuId.
 * Server ALWAYS reads price/title/image from Neon DB.
 * Client-provided prices are completely ignored.
 */

import { NextResponse } from "next/server";
import { ensureOnShopify } from "@/lib/shopify/just-in-time-push";
import { createNativeCheckout } from "@/lib/shopify/storefront-checkout";
import { getCheckoutProductById } from "@/lib/db/product-queries";
import { dbQuery } from "@/lib/db";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logCheckoutEvent } from "@/lib/security/audit-log";

// ── Input validation helpers ──
function parsePositiveInt(val: unknown, fallback: number, max: number): number {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export async function POST(req: Request) {
  try {
    // Distributed rate limit (Upstash Redis, falls back to in-memory)
    const ip = getClientIP(req);
    const { success: allowed } = await rateLimit("cart", ip);
    if (!allowed) {
      logCheckoutEvent("checkout_rate_limited", { clientIp: ip });
      return NextResponse.json(
        { success: false, error: "Prea multe încercări. Așteaptă un moment." },
        { status: 429 }
      );
    }

    const userAgent = req.headers.get("user-agent") || undefined;

    const body = await req.json();
    const rawItems = body.products || (body.product ? [body.product] : []);
    const customer = body.customer;

    // Validate: max 10 items per checkout
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ success: false, error: "Coșul este gol." }, { status: 400 });
    }
    if (rawItems.length > 10) {
      return NextResponse.json({ success: false, error: "Maxim 10 produse per comandă." }, { status: 400 });
    }

    console.log(`[Cart v3] Processing ${rawItems.length} item(s)...`);

    const lineItems: { variantId: string; quantity: number }[] = [];

    for (const item of rawItems) {
      // ── Validate pgId ──
      const pgId = Number(item.pgId);
      if (!Number.isInteger(pgId) || pgId <= 0) {
        console.warn(`[Cart v3] Invalid pgId: ${item.pgId}`);
        continue;
      }

      // ── Validate quantity ──
      const qty = parsePositiveInt(item.quantity, 1, 10);

      // ── ALWAYS fetch product data from Neon DB (never trust client) ──
      const pgProduct = await getCheckoutProductById(pgId);
      if (!pgProduct) {
        console.warn(`[Cart v3] Product ${pgId} not found or has invalid pricing`);
        logCheckoutEvent("product_not_found", { pgId, clientIp: ip, userAgent });
        return NextResponse.json(
          { success: false, error: "Produsul nu este disponibil pentru checkout." },
          { status: 400 }
        );
      }

      const title = pgProduct.title;
      const price = pgProduct.price;
      const oldPrice = pgProduct.oldPrice;
      const image = pgProduct.image;
      const category = pgProduct.category;



      // ── Resolve variant if skuId provided ──
      let variantPrice = price;
      let variantLabel = "";
      let variantStock: number | undefined = undefined;
      if (item.skuId) {
        try {
          const { rows } = await dbQuery(
            `SELECT price_ron, color, size, stock FROM ae_variants 
             WHERE product_id = $1 AND sku_id = $2 LIMIT 1`,
            [pgProduct.aeProductId || pgId, String(item.skuId)]
          );
          if (rows.length === 0) {
            console.warn(`[Cart v3] Variant ${item.skuId} not found for product ${pgId}`);
            return NextResponse.json(
              { success: false, error: "Varianta selectată nu mai este disponibilă." },
              { status: 400 }
            );
          }
          const v = rows[0];
          if (Number(v.price_ron) > 0) variantPrice = Number(v.price_ron);
          if (v.color) variantLabel += v.color;
          if (v.size) variantLabel += (variantLabel ? " / " : "") + v.size;
          if (v.stock != null) variantStock = Number(v.stock);
          // Check stock
          if (v.stock !== null && v.stock <= 0) {
            console.warn(`[Cart v3] Variant ${item.skuId} is out of stock`);
            return NextResponse.json(
              { success: false, error: "Varianta selectată nu mai este în stoc." },
              { status: 400 }
            );
          }
        } catch (e) {
          // skuId was explicitly provided — if we can't validate the variant, we MUST stop
          console.error(`[Cart v3] Variant lookup error for ${item.skuId}:`, e);
          return NextResponse.json(
            { success: false, error: "Nu am putut valida varianta selectată. Încearcă din nou." },
            { status: 500 }
          );
        }
      }

      // ── JIT push to Shopify with SERVER-VERIFIED data only ──
      const jitTitle = variantLabel ? `${title} (${variantLabel})` : title;
      const result = await ensureOnShopify(pgId, variantPrice, oldPrice, jitTitle, image, category, item.skuId ? String(item.skuId) : undefined, variantStock);
      lineItems.push({ variantId: result.variantId, quantity: qty });
      logCheckoutEvent("jit_create", { pgId, skuId: item.skuId ? String(item.skuId) : undefined, priceRon: variantPrice, clientIp: ip });
      console.log(`[Cart v3] ✅ ${jitTitle} → variant ${result.variantId} @ ${variantPrice} RON`);
    }

    if (lineItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nu am putut procesa niciun produs." },
        { status: 400 }
      );
    }

    // Create Shopify checkout
    console.log(`[Cart v3] Creating Shopify checkout with ${lineItems.length} line(s)...`);
    const { checkoutUrl, cartId, errors } = await createNativeCheckout(lineItems, {
      email: customer?.email,
      phone: customer?.phone,
      countryCode: "RO",
    });

    if (!checkoutUrl || errors.length > 0) {
      console.error("[Cart v3] Checkout failed:", errors);
      return NextResponse.json(
        { success: false, error: "Checkout-ul temporar nu a reușit. Încearcă din nou." },
        { status: 500 }
      );
    }

    logCheckoutEvent("checkout_success", {
      clientIp: ip,
      userAgent,
      payload: { itemCount: lineItems.length, cartId },
    });

    return NextResponse.json({
      success: true,
      checkoutUrl,
      cartId,
      itemCount: lineItems.reduce((s, li) => s + li.quantity, 0),
      currency: "RON",
    });
  } catch (error: any) {
    console.error("[Cart v3] Error:", error);
    logCheckoutEvent("checkout_fail", { error: error?.message });
    return NextResponse.json(
      { success: false, error: "A apărut o eroare la checkout. Încearcă din nou." },
      { status: 500 }
    );
  }
}
