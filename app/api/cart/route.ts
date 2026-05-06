/**
 * Cart API — Creates Shopify Draft Order using existing Shopify variants only
 */

import { NextResponse } from "next/server";
import { createCheckout } from "@/lib/shopify/product-sync";

export async function POST(req: Request) {
  try {
    const { products, product, quantity = 1, customer } = await req.json();

    const productList = products || (product ? [product] : []);

    if (productList.length === 0) {
      return NextResponse.json({ error: "No products" }, { status: 400 });
    }

    console.log(`[Cart] Checkout with ${productList.length} product(s)`);

    const lineItems = [];

    for (const p of productList) {
      if (!p.variantId) {
        return NextResponse.json(
          {
            success: false,
            error: `Produsul \"${p.title}\" nu are variant Shopify valid.`,
          },
          { status: 400 }
        );
      }

      lineItems.push({
        title: p.title,
        price: p.price,
        variantId: p.variantId,
        quantity: p.quantity || quantity,
      });
    }

    const { checkoutUrl, orderId } = await createCheckout(lineItems, customer);

    if (!checkoutUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Nu am putut crea checkout-ul Shopify.",
        },
        { status: 500 }
      );
    }

    const total = lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0);

    return NextResponse.json({
      success: true,
      checkoutUrl,
      orderId,
      totalAmount: total,
      itemCount: lineItems.length,
      currency: "RON",
    });
  } catch (error) {
    console.error("[Cart] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Eroare la crearea checkout-ului.",
        checkoutUrl: null,
      },
      { status: 500 }
    );
  }
}
