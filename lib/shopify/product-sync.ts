/**
 * Shopify Product Sync & Checkout Service
 * Uses ADMIN API (Draft Orders) instead of Storefront API
 * No Headless channel needed!
 */

import { getShopifyAccessToken } from "./auth";

const API_VERSION = "2026-04";

async function shopifyAdminGQL(query: string, variables?: Record<string, unknown>) {
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE!;

  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify Admin API error: ${res.status} — ${err}`);
  }

  const json = await res.json();
  return json;
}

// Cache: sourceProductId -> { shopifyProductId, shopifyVariantId }
const productCache = new Map<string, { shopifyProductId: string; shopifyVariantId: string }>();

/**
 * Creates product in Shopify if it doesn't exist yet
 */
export async function ensureProductInShopify(product: {
  id: string;
  title: string;
  description: string;
  price: number;
  oldPrice: number;
  category: string;
  images: string[];
}): Promise<{ shopifyProductId: string; shopifyVariantId: string }> {
  // Check cache
  if (productCache.has(product.id)) {
    return productCache.get(product.id)!;
  }

  try {
    const mutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            variants(first: 1) {
              edges { node { id } }
            }
          }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      input: {
        title: product.title,
        descriptionHtml: `<p>${product.description}</p>`,
        productType: product.category,
        vendor: "AICeVrei",
        tags: ["ai-generated", product.category],
        status: "ACTIVE",
        variants: [{
          price: product.price.toFixed(2),
          compareAtPrice: product.oldPrice.toFixed(2),
          sku: `ACV-${product.id}`,
          requiresShipping: true,
        }],
      },
    };

    const json = await shopifyAdminGQL(mutation, variables);
    const data = json.data;

    if (data?.productCreate?.userErrors?.length > 0) {
      console.error("[Shopify] Product errors:", data.productCreate.userErrors);
      throw new Error(JSON.stringify(data.productCreate.userErrors));
    }

    const result = {
      shopifyProductId: data.productCreate.product.id,
      shopifyVariantId: data.productCreate.product.variants.edges[0].node.id,
    };

    productCache.set(product.id, result);
    console.log(`[Shopify] ✅ Created: ${product.title} → ${result.shopifyProductId}`);
    return result;
  } catch (error: any) {
    console.error("[Shopify] Product creation error:", error.message);
    return {
      shopifyProductId: `mock-product-${product.id}`,
      shopifyVariantId: `mock-variant-${product.id}`,
    };
  }
}

/**
 * Creates a Draft Order with checkout URL
 * Uses Admin API — no Headless channel or Storefront API needed!
 */
export async function createCheckout(product: {
  title: string;
  price: number;
  variantId?: string;
}): Promise<{ checkoutUrl: string | null; orderId: string | null }> {
  try {
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            invoiceUrl
            name
            totalPrice
          }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      input: {
        lineItems: [{
          title: product.title,
          quantity: 1,
          originalUnitPrice: product.price.toFixed(2),
        }],
        useCustomerDefaultAddress: false,
      },
    };

    const json = await shopifyAdminGQL(mutation, variables);
    const data = json.data;

    if (data?.draftOrderCreate?.userErrors?.length > 0) {
      console.error("[Shopify] Draft order errors:", data.draftOrderCreate.userErrors);
      return { checkoutUrl: null, orderId: null };
    }

    const draftOrder = data.draftOrderCreate.draftOrder;
    console.log(`[Shopify] ✅ Draft order: ${draftOrder.name} — ${draftOrder.totalPrice}`);

    return {
      checkoutUrl: draftOrder.invoiceUrl,
      orderId: draftOrder.id,
    };
  } catch (error: any) {
    console.error("[Shopify] Draft order error:", error.message);
    return { checkoutUrl: null, orderId: null };
  }
}
