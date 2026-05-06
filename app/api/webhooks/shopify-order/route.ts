/**
 * Shopify Order Webhook → CJ Dropshipping Fulfillment
 * 
 * When a customer pays on Shopify, this webhook:
 * 1. Receives the order data
 * 2. Extracts CJ product IDs from SKUs (ACV-{cjPid})
 * 3. Looks up CJ variant IDs
 * 4. Creates order on CJ Dropshipping for fulfillment
 * 
 * Register webhook in Shopify: Settings → Notifications → Webhooks → "Order paid"
 * URL: https://aicevrei.vercel.app/api/webhooks/shopify-order
 */

import { NextResponse } from "next/server";
import { fulfillFromShopify } from "@/lib/suppliers/cj-order";

export async function POST(req: Request) {
  try {
    // Verify Shopify webhook (optional but recommended)
    const hmac = req.headers.get("x-shopify-hmac-sha256");
    
    const body = await req.json();
    
    console.log(`[Webhook] 📦 New Shopify order: #${body.order_number || body.id}`);
    console.log(`[Webhook] Customer: ${body.customer?.first_name} ${body.customer?.last_name}`);
    console.log(`[Webhook] Items: ${body.line_items?.length || 0}`);

    // Extract line items with SKUs
    const lineItems = (body.line_items || []).map((item: any) => ({
      sku: item.sku || "",
      quantity: item.quantity || 1,
      title: item.title || "",
    }));

    // Get shipping address
    const addr = body.shipping_address || body.billing_address || {};
    const shipping = {
      name: `${addr.first_name || ""} ${addr.last_name || ""}`.trim(),
      phone: addr.phone || body.phone || "",
      email: body.email || body.customer?.email || "",
      address1: addr.address1 || "",
      city: addr.city || "",
      province: addr.province || "",
      zip: addr.zip || "",
      countryCode: addr.country_code || "RO",
    };

    console.log(`[Webhook] Shipping to: ${shipping.name}, ${shipping.city}, ${shipping.countryCode}`);

    // Filter only CJ items (SKU starts with ACV-)
    const cjItems = lineItems.filter((item: any) => item.sku?.startsWith("ACV-"));
    
    if (cjItems.length === 0) {
      console.log("[Webhook] No CJ products in this order, skipping fulfillment");
      return NextResponse.json({ status: "ok", message: "No CJ items" });
    }

    console.log(`[Webhook] ${cjItems.length} CJ items to fulfill`);

    // Create CJ order
    const result = await fulfillFromShopify({
      orderId: String(body.id || body.order_number),
      lineItems: cjItems,
      shipping,
    });

    if (result.success) {
      console.log(`[Webhook] ✅ CJ order created: ${result.cjOrderId}`);
      return NextResponse.json({ 
        status: "fulfilled", 
        cjOrderId: result.cjOrderId,
      });
    } else {
      console.error(`[Webhook] ❌ CJ fulfillment failed: ${result.error}`);
      return NextResponse.json({ 
        status: "error", 
        error: result.error 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("[Webhook] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
