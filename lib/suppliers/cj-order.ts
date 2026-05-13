/**
 * CJ Dropshipping Order Fulfillment
 * Maps Swypik orders → CJ orders for automatic fulfillment
 * 
 * Flow: Swypik order → extract SKU (ACV-{cjPid}) → get CJ vid → create CJ order
 */

const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

let cachedToken: { token: string; expires: number } | null = null;

async function getCJToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token;
  }

  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY not configured");

  const res = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });

  const json = await res.json();
  if (!json.result || json.code !== 200) throw new Error(`CJ auth: ${json.message}`);

  cachedToken = {
    token: json.data?.accessToken || json.data,
    expires: Date.now() + 23 * 60 * 60 * 1000,
  };

  return cachedToken.token;
}

/**
 * Get variant ID (vid) for a CJ product by PID or SKU
 * Required for order creation
 */
export async function getCJVariantId(pidOrSku: string): Promise<string | null> {
  try {
    const token = await getCJToken();
    
    const url = `${CJ_BASE}/product/variant/query?pid=${encodeURIComponent(pidOrSku)}`;
    const res = await fetch(url, {
      headers: { "CJ-Access-Token": token },
    });

    const json = await res.json();
    if (json.code !== 200 || !json.data) {
      console.error("[CJ Order] Variant query failed:", json.message);
      return null;
    }

    // Return first variant's vid
    const variants = Array.isArray(json.data) ? json.data : json.data?.list || [];
    if (variants.length > 0) {
      const vid = variants[0].vid || variants[0].variantId;
      console.log(`[CJ Order] ✅ Got vid: ${vid} for pid: ${pidOrSku}`);
      return vid;
    }

    return null;
  } catch (error: any) {
    console.error("[CJ Order] Variant error:", error.message);
    return null;
  }
}

/**
 * Extract CJ Product ID from SKU
 * SKU format: ACV-{cjProductId}
 */
export function extractCJPidFromSKU(sku: string): string | null {
  if (!sku || !sku.startsWith("ACV-")) return null;
  return sku.replace("ACV-", "");
}

/**
 * Create order on CJ Dropshipping
 */
export async function createCJOrder(params: {
  swypikOrderId: string;
  shippingName: string;
  shippingPhone: string;
  shippingEmail: string;
  shippingAddress: string;
  shippingCity: string;
  shippingProvince: string;
  shippingZip: string;
  shippingCountryCode: string;
  products: { vid: string; quantity: number }[];
}): Promise<{ success: boolean; cjOrderId?: string; payUrl?: string; error?: string }> {
  try {
    const token = await getCJToken();

    const body = {
      orderNumber: `SWP-${params.swypikOrderId}`,
      shippingZip: params.shippingZip || "000000",
      shippingCountry: params.shippingCountryCode === "RO" ? "Romania" : params.shippingCountryCode,
      shippingCountryCode: params.shippingCountryCode,
      shippingProvince: params.shippingProvince || "",
      shippingCity: params.shippingCity,
      shippingPhone: params.shippingPhone,
      shippingCustomerName: params.shippingName,
      shippingAddress: params.shippingAddress,
      shippingAddress2: "",
      email: params.shippingEmail || "",
      payType: 1, // Page payment
      platform: "other",
      fromCountryCode: "CN",
      products: params.products.map(p => ({
        vid: p.vid,
        quantity: p.quantity,
      })),
    };

    console.log(`[CJ Order] Creating order for Swypik #${params.swypikOrderId}...`);

    const res = await fetch(`${CJ_BASE}/shopping/order/createOrderV2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (json.code === 200 && json.result) {
      const orderId = json.data?.orderId || json.data?.orderNum || json.data;
      const payUrl = json.data?.cjPayUrl;
      console.log(`[CJ Order] ✅ Order created! CJ ID: ${orderId}`);
      return { success: true, cjOrderId: String(orderId), payUrl };
    } else {
      console.error(`[CJ Order] ❌ Failed:`, json.message);
      return { success: false, error: json.message };
    }
  } catch (error: any) {
    console.error("[CJ Order] Error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Full fulfillment flow: Swypik order → CJ order
 * 1. Extract CJ PID from SKU
 * 2. Get VID from CJ
 * 3. Create CJ order
 */
export async function fulfillFromSwypik(swypikOrder: {
  orderId: string;
  lineItems: { sku: string; quantity: number }[];
  shipping: {
    name: string;
    phone: string;
    email: string;
    address1: string;
    city: string;
    province: string;
    zip: string;
    countryCode: string;
  };
}): Promise<{ success: boolean; cjOrderId?: string; error?: string }> {
  console.log(`[Fulfillment] Processing Swypik order #${swypikOrder.orderId}...`);

  const cjProducts: { vid: string; quantity: number }[] = [];

  for (const item of swypikOrder.lineItems) {
    const cjPid = extractCJPidFromSKU(item.sku);
    if (!cjPid) {
      console.log(`[Fulfillment] Skipping non-CJ item: ${item.sku}`);
      continue;
    }

    // Rate limit: 1 req/sec
    await new Promise(r => setTimeout(r, 1100));

    const vid = await getCJVariantId(cjPid);
    if (!vid) {
      console.error(`[Fulfillment] ❌ No vid for CJ pid: ${cjPid}`);
      continue;
    }

    cjProducts.push({ vid, quantity: item.quantity });
  }

  if (cjProducts.length === 0) {
    return { success: false, error: "No CJ products found in order" };
  }

  // Rate limit
  await new Promise(r => setTimeout(r, 1100));

  return createCJOrder({
    swypikOrderId: swypikOrder.orderId,
    shippingName: swypikOrder.shipping.name,
    shippingPhone: swypikOrder.shipping.phone,
    shippingEmail: swypikOrder.shipping.email,
    shippingAddress: swypikOrder.shipping.address1,
    shippingCity: swypikOrder.shipping.city,
    shippingProvince: swypikOrder.shipping.province,
    shippingZip: swypikOrder.shipping.zip,
    shippingCountryCode: swypikOrder.shipping.countryCode,
    products: cjProducts,
  });
}
