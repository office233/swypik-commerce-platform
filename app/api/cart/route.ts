/**
 * Cart API — Creates product in Shopify + Draft Order checkout with customer data
 */

import { NextResponse } from "next/server";
import { ensureProductInShopify, createCheckout } from "@/lib/shopify/product-sync";

export async function POST(req: Request) {
  try {
    const { product, quantity = 1, customer } = await req.json();

    if (!product) {
      return NextResponse.json({ error: "Product required" }, { status: 400 });
    }

    console.log(`[Cart] Order: "${product.title}" — ${product.price} lei — Customer: ${customer?.name || "anonymous"}`);

    // Step 1: Create product in Shopify (with real images)
    const { shopifyProductId, shopifyVariantId } = await ensureProductInShopify({
      id: product.id,
      title: product.title,
      description: product.description || product.title,
      price: product.price,
      oldPrice: product.oldPrice || product.price,
      category: product.category || "general",
      images: product.images || [],
    });

    // Step 2: Create Draft Order with customer info → checkout URL
    const { checkoutUrl, orderId } = await createCheckout(
      {
        title: product.title,
        price: product.price,
        variantId: shopifyVariantId,
      },
      customer
    );

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
    console.error("[Cart] Error:", error.message);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Order failed",
        checkoutUrl: null,
      },
      { status: 200 }
    );
  }
}
