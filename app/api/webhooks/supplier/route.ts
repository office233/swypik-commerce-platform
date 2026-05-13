/**
 * Supplier Fulfillment Webhook
 * POST /api/webhooks/supplier
 *
 * Called by CJ/AliExpress or manual fulfillment tools when a package ships.
 * Protected by SUPPLIER_WEBHOOK_SECRET header.
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { sendCustomerShippingAlert } from "@/lib/email/service";
import crypto from "crypto";

export async function POST(req: Request) {
  // ── 1. Authentication ──
  const secret = process.env.SUPPLIER_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Supplier Webhook] SUPPLIER_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const providedSecret =
    req.headers.get("x-webhook-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    "";

  try {
    if (
      !providedSecret ||
      !crypto.timingSafeEqual(
        Buffer.from(providedSecret),
        Buffer.from(secret)
      )
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Process webhook payload ──
  try {
    const body = await req.json();
    const { external_order_id, status, tracking_number } = body;

    if (!external_order_id || !tracking_number) {
      return NextResponse.json(
        { success: false, error: "external_order_id and tracking_number are required." },
        { status: 400 }
      );
    }

    if (status !== "shipped") {
      return NextResponse.json({ success: true, message: "Ignored, status is not shipped." });
    }

    // Update commerce_order_items -> source_status = 'fulfilled'
    const updateRes = await dbQuery(
      `UPDATE commerce_order_items
       SET source_status = 'fulfilled',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('tracking_number', $2::text)
       WHERE order_id = $1 AND source_status = 'processing_dropship'
       RETURNING order_id`,
      [external_order_id, tracking_number]
    );

    if (updateRes.rows.length > 0) {
      const orderId = updateRes.rows[0].order_id;

      // Get customer email from commerce_orders
      const orderRes = await dbQuery(
        `SELECT metadata->>'customer_email' as customer_email FROM commerce_orders WHERE id = $1 LIMIT 1`,
        [orderId]
      );

      if (orderRes.rows.length > 0 && orderRes.rows[0].customer_email) {
        await sendCustomerShippingAlert(orderRes.rows[0].customer_email, tracking_number);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Supplier Webhook] POST Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
