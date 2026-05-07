/**
 * Cart API — Creates a native Shopify Storefront cart and redirects to Shopify checkout
 */

import { NextResponse } from "next/server";
import { createNativeCheckout } from "@/lib/shopify/storefront-checkout";

type CheckoutProduct = {
  title?: string;
  variantId?: string;
  availableForSale?: boolean;
  quantity?: number;
};

export async function POST(req: Request) {
  try {
    const { products, product, quantity = 1, customer } = await req.json();
    const productList: CheckoutProduct[] = products || (product ? [product] : []);

    if (productList.length === 0) {
      return NextResponse.json({ success: false, error: "No products" }, { status: 400 });
    }

    const unavailable = productList.find((p) => p.availableForSale === false);
    if (unavailable) {
      return NextResponse.json(
        {
          success: false,
          error: `Produsul \"${unavailable.title || "selectat"}\" nu este disponibil pentru checkout Shopify.`,
        },
        { status: 400 }
      );
    }

    const missingVariant = productList.find((p) => !p.variantId);
    if (missingVariant) {
      return NextResponse.json(
        {
          success: false,
          error: `Produsul \"${missingVariant.title || "selectat"}\" nu are variant Shopify valid.`,
        },
        { status: 400 }
      );
    }

    const lineItems = productList.map((p) => ({
      variantId: p.variantId!,
      quantity: Math.max(1, Number(p.quantity || quantity || 1)),
    }));

    console.log(`[Cart] Native Shopify checkout with ${lineItems.length} line(s)`);

    const { checkoutUrl, cartId, errors } = await createNativeCheckout(lineItems, {
      email: customer?.email,
      phone: customer?.phone,
      countryCode: "RO",
    });

    if (!checkoutUrl || errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors[0] || "Nu am putut crea checkout-ul Shopify nativ.",
          checkoutUrl: null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      checkoutUrl,
      cartId,
      itemCount: lineItems.reduce((sum, li) => sum + li.quantity, 0),
      currency: "RON",
    });
  } catch (error: any) {
    console.error("[Cart] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Eroare la crearea checkout-ului Shopify.",
        checkoutUrl: null,
      },
      { status: 500 }
    );
  }
}
