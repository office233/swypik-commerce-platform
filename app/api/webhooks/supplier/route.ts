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
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import { verifySupplierWebhook } from "@/lib/webhooks/verify-supplier";

import { logger } from "@/lib/logger";
export async function POST(req: Request) {
  if (!isEnabled("fulfillment")) return frozenResponse("fulfillment");

  // ── 1. HMAC + timestamp + replay verification ──
  const rawBody = await req.text();
  const verify = await verifySupplierWebhook(req, rawBody);
  if (!verify.ok) {
    return NextResponse.json({ error: verify.error }, { status: verify.status });
  }

  // ── 2. Process webhook payload ──
  try {
    let body: { external_order_id?: unknown; status?: unknown; tracking_number?: unknown } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }
    const external_order_id = typeof body.external_order_id === "string" ? body.external_order_id : null;
    const tracking_number = typeof body.tracking_number === "string" ? body.tracking_number : null;
    const status = typeof body.status === "string" ? body.status : null;

    if (!external_order_id || !tracking_number) {
      return NextResponse.json(
        { success: false, error: "external_order_id and tracking_number are required." },
        { status: 400 }
      );
    }

    if (status !== "shipped") {
      return NextResponse.json({ success: true, message: "Ignored, status is not shipped." });
    }

    /*
     * Idempotency claim (P0 #8 fix, 2026-06-19).
     *
     * supplier_webhook_events has a UNIQUE index on
     *   (supplier_id, external_order_id, tracking_number)
     * which gives us free dedup. The UPDATE downstream is already
     * guarded by `WHERE source_status = 'processing_dropship'` so a
     * second arrival wouldn't re-fulfill — but the customer email
     * `sendCustomerShippingAlert` is NOT idempotent. Without this
     * claim, the buyer can get the same "your package shipped" email
     * multiple times when the supplier (or our own retry policy)
     * re-delivers.
     *
     * supplier_id defaults to "unknown" because the verify layer
     * doesn't currently expose a supplier identity field; tighten
     * this when the per-supplier signing is added.
     */
    try {
      const { rows: claimRows } = await dbQuery<{ id: string }>(
        `INSERT INTO supplier_webhook_events
                 (supplier_id, external_order_id, tracking_number, payload)
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (supplier_id, external_order_id, tracking_number) DO NOTHING
          RETURNING id`,
        ["unknown", external_order_id, tracking_number, rawBody || "{}"],
      );
      if (claimRows.length === 0) {
        logger.info(
          { external_order_id, tracking_number },
          "[Supplier Webhook] duplicate, skipping",
        );
        return NextResponse.json({ success: true, duplicate: true });
      }
    } catch (err) {
      logger.error({ err, external_order_id }, "[Supplier Webhook] idempotency claim failed");
      return NextResponse.json(
        { success: false, error: "Idempotency claim failed" },
        { status: 500 },
      );
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
  } catch (error) {
    logger.error({ err: error }, "[Supplier Webhook] POST Error:");
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
