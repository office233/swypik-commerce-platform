/**
 * Shopify Order Webhook — HMAC-verified fulfillment handler
 * 
 * Verifies X-Shopify-Hmac-Sha256 before processing.
 * Currently logs orders for manual fulfillment via AliExpress.
 * 
 * Future: Auto-fulfill via AliExpress DS API
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export async function POST(req: Request) {
  try {
    // Read raw body for HMAC verification
    const rawBody = await req.text();
    const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;

    // Fail-closed: reject if webhook secret is not configured in production
    if (process.env.NODE_ENV === "production" && !webhookSecret) {
      console.error("[Webhook] ❌ SHOPIFY_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    // Verify HMAC signature
    if (webhookSecret) {
      if (!hmacHeader) {
        console.warn("[Webhook] ❌ Missing HMAC header");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const digest = createHmac("sha256", webhookSecret)
        .update(rawBody, "utf8")
        .digest("base64");

      const sigBuffer = Buffer.from(digest);
      const headerBuffer = Buffer.from(hmacHeader);

      if (sigBuffer.length !== headerBuffer.length || !timingSafeEqual(sigBuffer, headerBuffer)) {
        console.warn("[Webhook] ❌ HMAC verification failed");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);

    // Log order summary (no PII in logs)
    console.log(`[Webhook] 📦 New order: #${body.order_number || body.id}`);
    console.log(`[Webhook] Items: ${body.line_items?.length || 0}, Total: ${body.total_price} ${body.currency}`);

    // TODO: Auto-fulfill via AliExpress when pipeline is ready

    return NextResponse.json({
      status: "received",
      orderId: body.id || body.order_number,
    });
  } catch (error: any) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
