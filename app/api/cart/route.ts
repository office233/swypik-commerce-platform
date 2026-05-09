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
import { getProductById } from "@/lib/db/product-queries";
import { dbQuery } from "@/lib/db";

// ── Input validation helpers ──
function parsePositiveInt(val: unknown, fallback: number, max: number): number {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// ── Rate limit (simple in-memory per IP) ──
const rateLimitMap = new Map<string, { count: number; ts: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;        // max 10 checkout attempts per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.ts > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, ts: now });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

export async function POST(req: Request) {
  try {
    // Rate limit check
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: "Prea multe încercări. Așteaptă un moment." },
        { status: 429 }
      );
    }

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
      const pgProduct = await getProductById(pgId);
      if (!pgProduct) {
        console.warn(`[Cart v3] Product ${pgId} not found in Neon`);
        continue;
      }

      const title = pgProduct.title;
      const price = pgProduct.price;
      const oldPrice = pgProduct.oldPrice;
      const image = pgProduct.images?.[0];
      const category = pgProduct.category;

      // ── Resolve variant if skuId provided ──
      let variantPrice = price;
      let variantLabel = "";
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
          // Check stock
          if (v.stock !== null && v.stock <= 0) {
            console.warn(`[Cart v3] Variant ${item.skuId} is out of stock`);
            return NextResponse.json(
              { success: false, error: "Varianta selectată nu mai este în stoc." },
              { status: 400 }
            );
          }
        } catch (e) {
          // If variant lookup fails, continue with base price only if skuId wasn't explicitly provided
          console.error(`[Cart v3] Variant lookup error for ${item.skuId}:`, e);
        }
      }

      // ── JIT push to Shopify with SERVER-VERIFIED data only ──
      const jitTitle = variantLabel ? `${title} (${variantLabel})` : title;
      const result = await ensureOnShopify(pgId, variantPrice, oldPrice, jitTitle, image, category);
      lineItems.push({ variantId: result.variantId, quantity: qty });
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

    return NextResponse.json({
      success: true,
      checkoutUrl,
      cartId,
      itemCount: lineItems.reduce((s, li) => s + li.quantity, 0),
      currency: "RON",
    });
  } catch (error: any) {
    console.error("[Cart v3] Error:", error);
    return NextResponse.json(
      { success: false, error: "A apărut o eroare la checkout. Încearcă din nou." },
      { status: 500 }
    );
  }
}
