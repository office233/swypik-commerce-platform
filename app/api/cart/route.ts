/**
 * Cart API v2 — Just-in-Time Shopify Checkout
 * 
 * Flow: Client sends pgId → JIT push to Shopify → Create cart → Return checkout URL
 * Products are created on Shopify only when the user wants to buy them
 */

import { NextResponse } from "next/server";
import { ensureOnShopify } from "@/lib/shopify/just-in-time-push";
import { createNativeCheckout } from "@/lib/shopify/storefront-checkout";
import { getProductById } from "@/lib/db/product-queries";

type CartItem = {
  pgId?: number;        // PostgreSQL product ID (new flow)
  variantId?: string;   // Shopify variant ID (legacy flow)
  title?: string;
  price?: number;
  oldPrice?: number;
  image?: string;
  category?: string;
  quantity?: number;
};

export async function POST(req: Request) {
  try {
    const { products, product, quantity = 1, customer } = await req.json();
    const items: CartItem[] = products || (product ? [product] : []);

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "Coșul este gol." }, { status: 400 });
    }

    console.log(`[Cart v2] Processing ${items.length} item(s)...`);

    // Resolve all items to Shopify variant IDs
    const lineItems: { variantId: string; quantity: number }[] = [];

    for (const item of items) {
      const qty = Math.max(1, Number(item.quantity || quantity || 1));

      // New flow: pgId from PostgreSQL
      if (item.pgId) {
        // Fetch full product data from PostgreSQL if needed
        let title = item.title;
        let price = item.price;
        let oldPrice = item.oldPrice;
        let image = item.image;
        let category = item.category;

        if (!price || !title) {
          const pgProduct = await getProductById(item.pgId);
          if (!pgProduct) {
            return NextResponse.json(
              { success: false, error: `Produsul #${item.pgId} nu a fost găsit.` },
              { status: 404 }
            );
          }
          title = pgProduct.title;
          price = pgProduct.price;
          oldPrice = pgProduct.oldPrice;
          image = pgProduct.images?.[0];
          category = pgProduct.category;
        }

        // JIT push to Shopify
        const result = await ensureOnShopify(item.pgId, price!, oldPrice || price! * 1.5, title!, image, category);
        lineItems.push({ variantId: result.variantId, quantity: qty });
        console.log(`[Cart v2] ✅ ${title} → variant ${result.variantId}`);
      }
      // Legacy flow: direct variantId
      else if (item.variantId) {
        lineItems.push({ variantId: item.variantId, quantity: qty });
      }
      else {
        console.warn(`[Cart v2] Skipping item without pgId or variantId`);
      }
    }

    if (lineItems.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nu am putut procesa niciun produs." },
        { status: 400 }
      );
    }

    // Create Shopify checkout
    console.log(`[Cart v2] Creating Shopify checkout with ${lineItems.length} line(s)...`);
    const { checkoutUrl, cartId, errors } = await createNativeCheckout(lineItems, {
      email: customer?.email,
      phone: customer?.phone,
      countryCode: "RO",
    });

    if (!checkoutUrl || errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0] || "Checkout Shopify a eșuat.", checkoutUrl: null },
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
    console.error("[Cart v2] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Eroare la checkout.", checkoutUrl: null },
      { status: 500 }
    );
  }
}
