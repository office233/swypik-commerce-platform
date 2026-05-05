/**
 * Shopify Product Sync & Checkout Service
 * REST API — includes shipping cost to Romania in product cost
 */

import { getShopifyAccessToken } from "./auth";

const API_VERSION = "2026-04";
const SHIPPING_RO_RON = 25; // Estimated CJ shipping to Romania

async function shopifyREST(endpoint: string, method = "GET", body?: any) {
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
    throw new Error(`Shopify ${res.status}: ${err.slice(0, 200)}`);
  }

  return res.json();
}

const productCache = new Map<string, { shopifyProductId: string; shopifyVariantId: string }>();

/**
 * Creates product in Shopify with cost = CJ price + shipping RO
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
    const imageObjects = (product.images || [])
      .filter((url) => url && url.startsWith("http"))
      .slice(0, 5)
      .map((src) => ({ src }));

    const payload = {
      product: {
        title: product.title,
        body_html: `<p>${product.description || product.title}</p>`,
        product_type: product.category || "General",
        vendor: "AICeVrei",
        tags: `ai-import, ${product.category || "general"}, transport-inclus`,
        status: "active",
        variants: [{
          price: product.price.toFixed(2),
          compare_at_price: product.oldPrice > product.price ? product.oldPrice.toFixed(2) : null,
          sku: `ACV-${product.id.slice(0, 20)}`,
          requires_shipping: true,
          inventory_management: null,
          // Cost = original CJ price + shipping to Romania
          cost: (product.price * 0.4 + SHIPPING_RO_RON).toFixed(2),
        }],
        images: imageObjects,
      },
    };

    const json = await shopifyREST("products.json", "POST", payload);

    if (!json.product) {
      throw new Error("No product returned");
    }

    const result = {
      shopifyProductId: String(json.product.id),
      shopifyVariantId: String(json.product.variants[0].id),
    };

    productCache.set(product.id, result);
    console.log(`[Shopify] ✅ Product: "${product.title}" (${imageObjects.length} imgs) → ID: ${result.shopifyProductId}`);
    return result;
  } catch (error: any) {
    console.error("[Shopify] Product error:", error.message);
    return { shopifyProductId: "", shopifyVariantId: "" };
  }
}

/**
 * Creates Draft Order with multiple line items + customer data
 */
export async function createCheckout(
  lineItems: { title: string; price: number; variantId?: string; quantity: number }[],
  customer?: { name?: string; email?: string; phone?: string; address?: string; city?: string; county?: string }
): Promise<{ checkoutUrl: string | null; orderId: string | null }> {
  try {
    const draftLineItems = lineItems.map((item) => {
      if (item.variantId && item.variantId.length > 0 && !item.variantId.startsWith("mock")) {
        return { variant_id: parseInt(item.variantId), quantity: item.quantity };
      }
      return { title: item.title, quantity: item.quantity, price: item.price.toFixed(2) };
    });

    const payload: any = {
      draft_order: {
        line_items: draftLineItems,
        use_customer_default_address: false,
        shipping_line: {
          title: "Transport România",
          price: "0.00", // Included in product price
          custom: true,
        },
      },
    };

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

    const json = await shopifyREST("draft_orders.json", "POST", payload);

    if (!json.draft_order) {
      console.error("[Shopify] Draft order failed:", JSON.stringify(json).slice(0, 300));
      return { checkoutUrl: null, orderId: null };
    }

    const d = json.draft_order;
    console.log(`[Shopify] ✅ Draft order: ${d.name} — ${d.total_price} RON — ${d.line_items?.length} items`);

    return {
      checkoutUrl: d.invoice_url || null,
      orderId: String(d.id),
    };
  } catch (error: any) {
    console.error("[Shopify] Draft error:", error.message);
    return { checkoutUrl: null, orderId: null };
  }
}
