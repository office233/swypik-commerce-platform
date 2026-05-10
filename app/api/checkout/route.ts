/**
 * Checkout API — Stripe Direct (replaces Shopify JIT flow)
 * 
 * SECURITY: Client sends ONLY pgId, quantity, skuId.
 * Server ALWAYS reads price/title/image from NeonDB.
 * Client-provided prices are completely ignored.
 * 
 * Flow: validate → fetch from NeonDB → create Stripe session → return URL
 */

import { NextResponse } from "next/server";
import { getCheckoutProductById } from "@/lib/db/product-queries";
import { dbQuery } from "@/lib/db";
import { createCheckoutSession, type CheckoutItem } from "@/lib/stripe/checkout";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logCheckoutEvent } from "@/lib/security/audit-log";

export const preferredRegion = "fra1";

function parsePositiveInt(val: unknown, fallback: number, max: number): number {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export async function POST(req: Request) {
  try {
    // Rate limit
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

    // Validate
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ success: false, error: "Coșul este gol." }, { status: 400 });
    }
    if (rawItems.length > 10) {
      return NextResponse.json({ success: false, error: "Maxim 10 produse per comandă." }, { status: 400 });
    }

    console.log(`[Checkout Stripe] Processing ${rawItems.length} item(s)...`);

    const checkoutItems: CheckoutItem[] = [];

    for (const item of rawItems) {
      const pgId = Number(item.pgId);
      if (!Number.isInteger(pgId) || pgId <= 0) {
        console.warn(`[Checkout] Invalid pgId: ${item.pgId}`);
        continue;
      }

      const qty = parsePositiveInt(item.quantity, 1, 10);

      // ALWAYS fetch from NeonDB — never trust client
      const pgProduct = await getCheckoutProductById(pgId);
      if (!pgProduct) {
        console.warn(`[Checkout] Product ${pgId} not found`);
        logCheckoutEvent("product_not_found", { pgId, clientIp: ip, userAgent });
        return NextResponse.json(
          { success: false, error: "Produsul nu este disponibil." },
          { status: 400 }
        );
      }

      let variantPrice = pgProduct.price;
      let variantColor = "";
      let variantSize = "";

      // Resolve variant
      if (item.skuId) {
        try {
          const { rows } = await dbQuery(
            `SELECT price_ron, color, size, stock FROM ae_variants 
             WHERE product_id = $1 AND sku_id = $2 LIMIT 1`,
            [pgProduct.aeProductId || pgId, String(item.skuId)]
          );
          if (rows.length === 0) {
            return NextResponse.json(
              { success: false, error: "Varianta selectată nu mai este disponibilă." },
              { status: 400 }
            );
          }
          const v = rows[0];
          if (Number(v.price_ron) > 0) variantPrice = Number(v.price_ron);
          if (v.color) variantColor = v.color;
          if (v.size) variantSize = v.size;
          if (v.stock !== null && v.stock <= 0) {
            return NextResponse.json(
              { success: false, error: "Varianta selectată nu mai este în stoc." },
              { status: 400 }
            );
          }
        } catch (e) {
          console.error(`[Checkout] Variant lookup error:`, e);
          return NextResponse.json(
            { success: false, error: "Nu am putut valida varianta selectată." },
            { status: 500 }
          );
        }
      }

      const titleParts = [pgProduct.title];
      if (variantColor) titleParts.push(variantColor);
      if (variantSize) titleParts.push(variantSize);

      checkoutItems.push({
        pgId,
        title: titleParts.join(" — "),
        price: variantPrice,
        oldPrice: pgProduct.oldPrice,
        image: pgProduct.image || undefined,
        quantity: qty,
        skuId: item.skuId ? String(item.skuId) : undefined,
        color: variantColor || undefined,
        size: variantSize || undefined,
      });

      console.log(`[Checkout] ✅ ${pgProduct.title} @ ${variantPrice} RON x${qty}`);
    }

    if (checkoutItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nu am putut procesa niciun produs." },
        { status: 400 }
      );
    }

    // Create Stripe Checkout session
    const { url, sessionId } = await createCheckoutSession(checkoutItems, {
      customerEmail: customer?.email,
    });

    logCheckoutEvent("checkout_success", {
      clientIp: ip,
      userAgent,
      payload: {
        itemCount: checkoutItems.length,
        sessionId,
        totalRon: checkoutItems.reduce((s, i) => s + i.price * i.quantity, 0),
        provider: "stripe",
      },
    });

    console.log(`[Checkout] 🎉 Stripe session ${sessionId} created`);

    return NextResponse.json({
      success: true,
      checkoutUrl: url,
      sessionId,
      itemCount: checkoutItems.reduce((s, i) => s + i.quantity, 0),
      currency: "RON",
    });
  } catch (error: any) {
    console.error("[Checkout] Error:", error);
    logCheckoutEvent("checkout_fail", { error: error?.message });
    return NextResponse.json(
      { success: false, error: "A apărut o eroare la checkout. Încearcă din nou." },
      { status: 500 }
    );
  }
}
