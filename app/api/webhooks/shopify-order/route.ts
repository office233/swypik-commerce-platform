/**
 * Shopify Order Webhook — Fulfillment placeholder
 * 
 * When a customer pays on Shopify, this webhook receives the order data.
 * Currently logs the order for manual fulfillment via AliExpress.
 * 
 * Future: Auto-fulfill via AliExpress DS API
 */

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log(`[Webhook] 📦 New Shopify order: #${body.order_number || body.id}`);
    console.log(`[Webhook] Customer: ${body.customer?.first_name} ${body.customer?.last_name}`);
    console.log(`[Webhook] Items: ${body.line_items?.length || 0}`);

    // Extract shipping address for logging
    const addr = body.shipping_address || body.billing_address || {};
    console.log(`[Webhook] Ship to: ${addr.first_name} ${addr.last_name}, ${addr.city}, ${addr.country_code || "RO"}`);

    // TODO: Auto-fulfill via AliExpress when pipeline is ready
    // For now, orders are fulfilled manually

    return NextResponse.json({
      status: "received",
      orderId: body.id || body.order_number,
      message: "Order logged for manual fulfillment",
    });
  } catch (error: any) {
    console.error("[Webhook] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
