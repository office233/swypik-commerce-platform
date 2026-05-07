/**
 * Just-in-Time Shopify Push
 * Creates a product on Shopify ONLY when needed for checkout
 * Returns variantId for Storefront cart creation
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
  // 1. Check if already pushed
  const { rows } = await dbQuery(
    "SELECT shopify_id, shopify_variant_id FROM products WHERE id = $1 AND pushed_to_shopify = true AND shopify_id IS NOT NULL",
    [pgId]
  );

  if (rows[0]?.shopify_id && rows[0]?.shopify_variant_id) {
    console.log(`[JIT] Product ${pgId} already on Shopify: ${rows[0].shopify_id}`);

    // Update price on Shopify to match current calculated price
    try {
      await updateVariantPrice(String(rows[0].shopify_variant_id), price, oldPrice);
    } catch (e) {
      // Price update is best-effort, checkout still works
    }

    return {
      shopifyId: String(rows[0].shopify_id),
      variantId: String(rows[0].shopify_variant_id),
      price,
    };
  }

  // 2. Create on Shopify
  console.log(`[JIT] Creating product ${pgId} on Shopify...`);
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE!;

  const mainCat = (category || "").split(" > ")[0].trim();
  const subCat = (category || "").split(" > ")[1]?.trim() || "";

  const payload = {
    product: {
      title,
      body_html: `<p>${title}</p><p>🚚 Transport inclus | ⭐ Produs verificat | 🔒 Checkout securizat</p>`,
      vendor: "AICeVrei",
      product_type: subCat || mainCat || "General",
      tags: [mainCat, subCat, "cj-dropshipping", "jit-push"].filter(Boolean).join(", "),
      status: "active",
      images: image ? [{ src: image, alt: title }] : [],
      variants: [{
        price: String(price),
        compare_at_price: oldPrice > price ? String(oldPrice) : null,
        sku: `PG-${pgId}`,
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

  // 3. Save to PostgreSQL
  await dbQuery(`
    UPDATE products SET 
      pushed_to_shopify = true,
      shopify_id = $1,
      shopify_variant_id = $2,
      pushed_at = NOW(),
      retail_price_usd = $3
    WHERE id = $4
  `, [shopifyId, variantId, price, pgId]);

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
