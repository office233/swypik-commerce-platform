/**
 * Shopify Product Sync & Checkout Service
 * Uses ADMIN API with REST fallback for reliable product creation
 */

import { getShopifyAccessToken } from "./auth";

const API_VERSION = "2026-04";

async function shopifyAdminREST(endpoint: string, method = "GET", body?: any) {
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE!;

  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify REST ${res.status}: ${err.slice(0, 200)}`);
  }

  return res.json();
}

// Cache: sourceProductId -> { shopifyProductId, shopifyVariantId }
const productCache = new Map<string, { shopifyProductId: string; shopifyVariantId: string }>();

/**
 * Creates product in Shopify using REST API (more reliable than GraphQL for product creation)
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
  if (productCache.has(product.id)) {
    return productCache.get(product.id)!;
  }

  try {
    // Build image objects
    const imageObjects = (product.images || [])
      .filter((url) => url && url.startsWith("http"))
      .slice(0, 3)
      .map((src) => ({ src }));

    const payload = {
      product: {
        title: product.title,
        body_html: `<p>${product.description || product.title}</p>`,
        product_type: product.category || "General",
        vendor: "AICeVrei",
        tags: `ai-import, ${product.category || "general"}`,
        status: "active",
        variants: [{
          price: product.price.toFixed(2),
          compare_at_price: product.oldPrice > product.price ? product.oldPrice.toFixed(2) : null,
          sku: `ACV-${product.id.slice(0, 20)}`,
          requires_shipping: true,
          inventory_management: null, // Don't track inventory
        }],
        images: imageObjects,
      },
    };

    const json = await shopifyAdminREST("products.json", "POST", payload);

    if (!json.product) {
      console.error("[Shopify] Product creation failed:", JSON.stringify(json).slice(0, 300));
      throw new Error("No product returned");
    }

    const result = {
      shopifyProductId: String(json.product.id),
      shopifyVariantId: String(json.product.variants[0].id),
    };

    productCache.set(product.id, result);
    console.log(`[Shopify] ✅ Product created: "${product.title}" → ID: ${result.shopifyProductId}`);
    return result;
  } catch (error: any) {
    console.error("[Shopify] Product error:", error.message);
    // Don't return mock IDs — return empty so checkout uses line item only
    return {
      shopifyProductId: "",
      shopifyVariantId: "",
    };
  }
}

/**
 * Creates a Draft Order with customer info and checkout URL
 */
export async function createCheckout(product: {
  title: string;
  price: number;
  variantId?: string;
}, customer?: {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  county?: string;
}): Promise<{ checkoutUrl: string | null; orderId: string | null }> {
  try {
    // Build line items
    const lineItems: any[] = [];

    if (product.variantId && !product.variantId.startsWith("mock")) {
      // Use real Shopify variant
      lineItems.push({
        variant_id: parseInt(product.variantId),
        quantity: 1,
      });
    } else {
      // Custom line item (no Shopify product needed)
      lineItems.push({
        title: product.title,
        quantity: 1,
        price: product.price.toFixed(2),
      });
    }

    // Build draft order payload
    const payload: any = {
      draft_order: {
        line_items: lineItems,
        use_customer_default_address: false,
      },
    };

    // Add customer data if provided
    if (customer?.name || customer?.email || customer?.phone) {
      const nameParts = (customer.name || "").trim().split(" ");
      payload.draft_order.customer = {
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        email: customer.email || undefined,
        phone: customer.phone || undefined,
      };

      if (customer.address || customer.city) {
        payload.draft_order.shipping_address = {
          first_name: nameParts[0] || "",
          last_name: nameParts.slice(1).join(" ") || "",
          address1: customer.address || "",
          city: customer.city || "",
          province: customer.county || "",
          country: "Romania",
          country_code: "RO",
          phone: customer.phone || "",
        };
      }
    }

    const json = await shopifyAdminREST("draft_orders.json", "POST", payload);

    if (!json.draft_order) {
      console.error("[Shopify] Draft order failed:", JSON.stringify(json).slice(0, 300));
      return { checkoutUrl: null, orderId: null };
    }

    const draftOrder = json.draft_order;
    console.log(`[Shopify] ✅ Draft order: ${draftOrder.name} — ${draftOrder.total_price} RON`);

    return {
      checkoutUrl: draftOrder.invoice_url || null,
      orderId: String(draftOrder.id),
    };
  } catch (error: any) {
    console.error("[Shopify] Draft order error:", error.message);
    return { checkoutUrl: null, orderId: null };
  }
}
