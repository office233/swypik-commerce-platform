/**
 * Cart API — Creates Shopify Draft Order with multiple products + customer data
 * Each product includes: cost CJ + transport RO + markup + TVA
 */

import { NextResponse } from "next/server";
import { ensureProductInShopify, createCheckout } from "@/lib/shopify/product-sync";

export async function POST(req: Request) {
  try {
    const { products, product, quantity = 1, customer } = await req.json();

    // Support both single product and array of products
    const productList = products || (product ? [product] : []);

    if (productList.length === 0) {
      return NextResponse.json({ error: "No products" }, { status: 400 });
    }

    console.log(`[Cart] Order: ${productList.length} product(s) — Customer: ${customer?.name || "anon"}`);

    // Create all products in Shopify + build line items
    const lineItems = [];

    for (const p of productList) {
      const { shopifyProductId, shopifyVariantId } = await ensureProductInShopify({
        id: p.id,
        title: p.title,
        description: p.description || p.title,
        price: p.price,
        oldPrice: p.oldPrice || p.price,
        category: p.category || "general",
        images: p.images || [],
      });

      lineItems.push({
        title: p.title,
        price: p.price,
        variantId: shopifyVariantId,
        quantity: p.quantity || quantity,
      });
    }

    // Create single Draft Order with ALL line items
    const { checkoutUrl, orderId } = await createCheckout(lineItems, customer);

    const total = lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);

    return NextResponse.json({
      success: true,
      checkoutUrl,
      orderId,
      totalAmount: total,
      itemCount: lineItems.length,
      currency: "RON",
    });
  } catch (error: any) {
    console.error("[Cart] Error:", error.message);
    return NextResponse.json({ success: false, error: error.message, checkoutUrl: null }, { status: 200 });
  }
}
