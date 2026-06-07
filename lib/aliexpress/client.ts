import crypto from "crypto";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "aliexpress-api" });

const APP_KEY = process.env.ALIEXPRESS_APP_KEY || "";
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET || "";
const TOKEN = process.env.ALIEXPRESS_ACCESS_TOKEN || "";
const DEFAULT_AE_API_TIMEOUT_MS = 25_000;

function aeApiTimeoutMs(): number {
  const configured = Number(process.env.ALIEXPRESS_API_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_AE_API_TIMEOUT_MS;
}

function stringifyParam(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type AEParams = Record<string, unknown>;

export async function callAE(method: string, params: AEParams = {}) {
  if (!APP_KEY || !APP_SECRET || !TOKEN) {
    throw new Error("AliExpress credentials missing");
  }

  const sysParams: Record<string, string> = {
    app_key: APP_KEY,
    method,
    session: TOKEN,
    sign_method: "md5",
    timestamp: String(Date.now()),
    format: "json",
    v: "2.0",
    partner_id: "swypik-nodejs-1.0",
  };

  const appParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    appParams[k] = stringifyParam(v);
  }

  const signSource: Record<string, string> = { ...sysParams, ...appParams };
  const sortedKeys = Object.keys(signSource).sort();
  let signStr = APP_SECRET;
  for (const k of sortedKeys) signStr += k + signSource[k];
  signStr += APP_SECRET;

  const sign = crypto.createHash("md5").update(signStr, "utf8").digest("hex").toUpperCase();

  const queryParams = new URLSearchParams({ ...sysParams, sign });
  const url = `https://api-sg.aliexpress.com/sync?${queryParams.toString()}`;
  const body = new URLSearchParams(appParams).toString();

  const timeoutMs = aeApiTimeoutMs();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error(`AliExpress API timeout after ${timeoutMs}ms`);
    }
    throw err;
  }

  const data = await res.json();
  if (data.error_response) {
    log.error({ method, error: data.error_response }, "AE API error");
    throw new Error(data.error_response.msg || "Unknown AE API error");
  }
  return data;
}

// Shipping address shape from checkout / orders table.
type AEShippingAddress = {
  name: string;
  phone_country?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country?: string;
  postal_code: string;
};
type AEOrderItem = {
  ae_product_id: string | number;
  ae_sku_attr?: string;
  quantity: number;
  logistics_service_name?: string;
};

export async function placeDropshipOrder(
  orderId: string,
  shippingAddress: AEShippingAddress,
  items: AEOrderItem[]
) {
  // Format items for aliexpress.ds.trade.order.add
  // Docs: https://open.aliexpress.com/doc/api.htm?apiName=aliexpress.ds.trade.order.add
  
  const product_items = items.map((item) => ({
    product_id: Number(item.ae_product_id),
    sku_attr: item.ae_sku_attr || "",
    product_count: item.quantity,
    logistics_service_name: item.logistics_service_name || "CAINIAO_STANDARD",
  }));

  const logistics_address = {
    contact_person: shippingAddress.name,
    phone_country: shippingAddress.phone_country || "+40",
    mobile_no: (shippingAddress.phone || "0700000000").replace(/^\+?\d{1,3}/, ""),
    address: `${shippingAddress.line1} ${shippingAddress.line2 || ""}`.trim(),
    city: shippingAddress.city,
    province: shippingAddress.state || shippingAddress.city,
    country: shippingAddress.country || "RO",
    zip: shippingAddress.postal_code,
  };

  const params = {
    param_place_order_request4_open_api_d_t_o: {
      logistics_address,
      product_items,
      out_order_id: orderId,
    },
  };

  try {
    const response = await callAE("aliexpress.ds.order.create", params);
    const raw =
      response.aliexpress_ds_order_create_response?.result ??
      response.aliexpress_trade_buy_placeorder_response?.result ??
      response.result;
    if (!raw) return raw;
    const numbers = raw.order_list?.number;
    const order_list = Array.isArray(numbers)
      ? numbers.map(String)
      : numbers != null
      ? [String(numbers)]
      : Array.isArray(raw.order_list)
      ? raw.order_list.map(String)
      : [];
    return { ...raw, order_list };
  } catch (err) {
    log.error({ err, orderId }, "Failed to place AE order");
    throw err;
  }
}

export async function getDropshipOrderStatus(aeOrderId: string) {
  const params = {
    order_id: aeOrderId,
  };

  try {
    const response = await callAE("aliexpress.ds.trade.order.get", params);
    return response.aliexpress_ds_trade_order_get_response?.result;
  } catch (err) {
    log.error({ err, aeOrderId }, "Failed to get AE order status");
    throw err;
  }
}
