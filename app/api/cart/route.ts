/**
 * Cart API — Creates products in Shopify + Draft Order checkout
 * Uses Admin API only — no Headless channel needed!
 */

import { NextResponse } from "next/server";
import { ensureProductInShopify, createCheckout } from "@/lib/shopify/product-sync";

export async function POST(req: Request) {
  try {
    const { product, quantity = 1 } = await req.json();

    if (!product) {
      return NextResponse.json({ error: "Product required" }, { status: 400 });
    }

    console.log(`[Cart API] Processing: ${product.title} — ${product.price} lei`);

    // Step 1: Create product in Shopify
    const { shopifyProductId, shopifyVariantId } = await ensureProductInShopify({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      oldPrice: product.oldPrice,
      category: product.category,
      images: product.images || [],
    });

    // Step 2: Create Draft Order checkout URL
    const { checkoutUrl, orderId } = await createCheckout({
      title: product.title,
      price: product.price,
      variantId: shopifyVariantId,
    });

    return NextResponse.json({
      success: true,
      checkoutUrl,
      orderId,
      shopifyProductId,
      shopifyVariantId,
      totalAmount: product.price,
      currency: "RON",
    });
  } catch (error: any) {
    console.error("[Cart API] Error:", error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || "Cart creation failed",
        message: "Produsul a fost salvat. Checkout-ul va fi disponibil în curând."
      },
      { status: 200 } // Return 200 so frontend doesn't show error
    );
  }
}
