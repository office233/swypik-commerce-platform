import crypto from "crypto";

const APP_KEY = process.env.ALIEXPRESS_APP_KEY || "";
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || "";
const TOKEN = process.env.ALIEXPRESS_ACCESS_TOKEN || "";

export async function callAE(method: string, params: Record<string, any> = {}) {
  if (!APP_KEY || !APP_SECRET || !TOKEN) {
    throw new Error("AliExpress credentials missing");
  }

  const url = new URL("https://api-sg.aliexpress.com/sync");
  const allParams: Record<string, any> = {
    app_key: APP_KEY,
    method,
    session: TOKEN,
    sign_method: "md5",
    timestamp: new Date()
      .toISOString()
      .replace(/\.\d+Z/, "+0000")
      .replace(/T/, " "),
    v: "2.0",
    ...params,
  };

  const sorted = Object.keys(allParams)
    .sort()
    .reduce((acc, k) => {
      acc[k] = allParams[k];
      return acc;
    }, {} as Record<string, any>);

  let signStr = "";
  for (const k in sorted) {
    if (sorted[k] !== undefined && sorted[k] !== null) {
      // API expects objects/arrays to be JSON stringified
      if (typeof sorted[k] === 'object') {
        sorted[k] = JSON.stringify(sorted[k]);
      }
      signStr += k + sorted[k];
    }
  }

  const sign = crypto
    .createHmac("md5", APP_SECRET)
    .update(signStr, "utf8")
    .digest("hex")
    .toUpperCase();

  url.search = new URLSearchParams({ ...allParams, sign }).toString();

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (data.error_response) {
    console.error(`[AE API] Error calling ${method}:`, data.error_response);
    throw new Error(data.error_response.msg || "Unknown AE API error");
  }
  return data;
}

export async function placeDropshipOrder(
  orderId: string,
  shippingAddress: any,
  items: any[]
) {
  // Format items for aliexpress.ds.trade.order.add
  // Docs: https://open.aliexpress.com/doc/api.htm?apiName=aliexpress.ds.trade.order.add
  
  const product_base_item_params = items.map((item) => ({
    product_id: item.ae_product_id,
    sku_attr: item.ae_sku_attr || "", // Must match exact AE sku attribute string, or use sku_id? DS API usually takes sku_attr or sku_id
    product_count: item.quantity,
    logistics_service_name: "CAINIAO_STANDARD", // Default standard shipping
  }));

  const logistics_address = {
    contact_person: shippingAddress.name,
    phone_country: "RO", 
    mobile_no: shippingAddress.phone || "0000000000",
    address: `${shippingAddress.line1} ${shippingAddress.line2 || ""}`.trim(),
    city: shippingAddress.city,
    province: shippingAddress.state || shippingAddress.city,
    country: shippingAddress.country || "RO",
    zip: shippingAddress.postal_code,
  };

  const params = {
    param_place_order_request4_open_api_d_t_o: JSON.stringify({
      product_base_item_params,
      logistics_address,
      out_order_id: orderId,
    }),
  };

  try {
    const response = await callAE("aliexpress.ds.trade.order.add", params);
    return response.aliexpress_ds_trade_order_add_response?.result;
  } catch (error: any) {
    console.error(`[AE API] Failed to place order ${orderId}:`, error);
    throw error;
  }
}

export async function getDropshipOrderStatus(aeOrderId: string) {
  const params = {
    order_id: aeOrderId,
  };

  try {
    const response = await callAE("aliexpress.ds.trade.order.get", params);
    return response.aliexpress_ds_trade_order_get_response?.result;
  } catch (error: any) {
    console.error(`[AE API] Failed to get order status for ${aeOrderId}:`, error);
    throw error;
  }
}
