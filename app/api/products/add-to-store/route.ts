/**
 * Add Product to Store API
 * Called when store owner clicks "Add to Store" on a product
 * Pushes the product to Shopify
 */

import { NextResponse } from "next/server";
import { ensureProductInShopify } from "@/lib/shopify/product-sync";

export async function POST(req: Request) {
  try {
    const product = await req.json();

    if (!product?.id || !product?.title) {
      return NextResponse.json({ error: "Missing product data" }, { status: 400 });
    }

    console.log(`[Add to Store] Adding: "${product.title}" (${product.id})`);

    const result = await ensureProductInShopify({
      id: product.id,
      title: product.title,
      description: product.description || product.title,
      price: product.price || 0,
      oldPrice: product.oldPrice || product.price || 0,
      category: product.category || "general",
      images: product.images || [],
    });

    if (result.shopifyProductId) {
      console.log(`[Add to Store] ✅ Product added to Shopify: ${result.shopifyProductId}`);
      return NextResponse.json({
        success: true,
        shopifyProductId: result.shopifyProductId,
        shopifyVariantId: result.shopifyVariantId,
        message: `Produs adăugat în magazin! 🎯`,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: "Failed to add to Shopify",
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("[Add to Store] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
