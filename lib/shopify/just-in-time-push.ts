/**
 * Just-in-Time Shopify Push
 * Creates a product on Shopify ONLY when needed for checkout
 * Returns variantId for Storefront cart creation
 * 
 * Updated for ae_products table (AliExpress direct)
 */

import { getShopifyAccessToken } from "./auth";
import { dbQuery } from "@/lib/db";

const API_VERSION = "2026-04";

type JITResult = {
  shopifyId: string;
  variantId: string;
  price: number;
};

export async function ensureOnShopify(pgId: number, price: number, oldPrice: number, title: string, image?: string, category?: string): Promise<JITResult> {
  // 1. Create on Shopify (always fresh — no caching old Shopify IDs)
  console.log(`[JIT] Creating product ${pgId} on Shopify...`);
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE!;

  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const payload = {
    product: {
      title,
      body_html: `<p>${safeTitle}</p><p>🚚 Transport inclus | ⭐ Produs verificat | 🔒 Checkout securizat</p>`,
      vendor: "AICeVrei",
      product_type: category || "General",
      tags: [category, "aliexpress", "jit-push"].filter(Boolean).join(", "),
      status: "active",
      images: image ? [{ src: image, alt: title }] : [],
      variants: [{
        price: String(price),
        compare_at_price: oldPrice > price ? String(oldPrice) : null,
        sku: `AE-${pgId}`,
        inventory_management: "shopify",
        inventory_quantity: 999,
        requires_shipping: true,
      }],
    },
  };

  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/products.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Shopify create failed: ${res.status} — ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const shopifyId = data.product?.id;
  const variantId = data.product?.variants?.[0]?.id;

  if (!shopifyId || !variantId) {
    throw new Error("Shopify returned no product/variant ID");
  }

  console.log(`[JIT] ✅ Product ${pgId} → Shopify #${shopifyId} (variant ${variantId}) @ ${price} RON`);

  return {
    shopifyId: String(shopifyId),
    variantId: String(variantId),
    price,
  };
}

async function updateVariantPrice(variantId: string, price: number, compareAt: number) {
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE!;

  await fetch(`https://${store}/admin/api/${API_VERSION}/variants/${variantId}.json`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      variant: {
        id: parseInt(variantId),
        price: String(price),
        compare_at_price: compareAt > price ? String(compareAt) : null,
      },
    }),
  });
}
