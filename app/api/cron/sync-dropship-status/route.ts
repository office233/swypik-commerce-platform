import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { timingSafeEqual } from "crypto";
import { getDropshipOrderStatus } from "@/lib/aliexpress/client";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";

import { logger } from "@/lib/logger";
import { runCron } from "@/lib/cron/runCron";
export const dynamic = "force-dynamic";

// Map AE status -> { source_status (valid per CHECK), fulfillment_state (informational metadata), order_status (valid for commerce_orders.status) }
function mapAeStatus(aeStatus: string | null | undefined): {
  sourceStatus: string;
  fulfillmentState: string;
  orderStatus: string | null;
  terminal: boolean;
} {
  switch (aeStatus) {
    case "WAIT_SELLER_SEND_GOODS":
    case "PLACE_ORDER_SUCCESS":
      return { sourceStatus: "processing_dropship", fulfillmentState: "awaiting_shipment", orderStatus: null, terminal: false };
    case "SELLER_PART_SEND_GOODS":
    case "WAIT_BUYER_ACCEPT_GOODS":
      // Informational only — source_status stays processing_dropship to satisfy CHECK constraint
      return { sourceStatus: "processing_dropship", fulfillmentState: "shipped", orderStatus: null, terminal: false };
    case "FINISH":
      return { sourceStatus: "fulfilled", fulfillmentState: "delivered", orderStatus: "fulfilled", terminal: true };
    case "IN_CANCEL":
    case "RISK_CONTROL":
    case "FUND_PROCESSING":
      return { sourceStatus: "cancelled", fulfillmentState: "cancelled", orderStatus: "cancelled", terminal: true };
    default:
      return { sourceStatus: "processing_dropship", fulfillmentState: aeStatus || "unknown", orderStatus: null, terminal: false };
  }
}

async function handleGET(req: Request) {
  if (!isEnabled("fulfillment")) return frozenResponse("fulfillment");
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || req.headers.get("x-cron-secret");
  const cronSecretHeader = req.headers.get("cron-secret") || req.headers.get("CRON_SECRET");

  const providedSecret = token || cronSecretHeader;
  const expected = process.env.CRON_SECRET;
  if (!expected || !providedSecret ||
      Buffer.byteLength(providedSecret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch processing dropship items grouped by ae_order_id + order_id
    const { rows: processingItems } = await dbQuery(
      `SELECT id, order_id, metadata->>'ae_order_id' AS ae_order_id
       FROM commerce_order_items
       WHERE source_status = 'processing_dropship'
         AND metadata ? 'ae_order_id'
         AND metadata->>'ae_order_id' IS NOT NULL
         AND metadata->>'ae_order_id' <> ''`
    );

    if (processingItems.length === 0) {
      return NextResponse.json({ success: true, syncedCount: 0, errorCount: 0 });
    }

    // Build (ae_order_id -> [{itemId, orderId}]) map so we update scoped, not globally
    const byAeOrder = new Map<string, { itemId: string; orderId: string }[]>();
    for (const it of processingItems) {
      const list = byAeOrder.get(it.ae_order_id) || [];
      list.push({ itemId: it.id, orderId: it.order_id });
      byAeOrder.set(it.ae_order_id, list);
    }

    let syncedCount = 0;
    let errorCount = 0;
    const nowIso = new Date().toISOString();

    for (const [aeOrderId, group] of byAeOrder.entries()) {
      try {
        const statusResult = await getDropshipOrderStatus(aeOrderId);
        const aeStatus: string | undefined = statusResult?.order_status || statusResult?.logistics_status;
        const mapped = mapAeStatus(aeStatus);

        // Extract tracking if present
        let trackingNumber: string | null = null;
        let trackingCompany: string | null = null;
        let trackingUrl: string | null = null;
        const logList = statusResult?.logistics_info_list?.logistics_info_list
          || statusResult?.logistics_info_list
          || statusResult?.tracking_list;
        if (Array.isArray(logList) && logList.length > 0) {
          const li = logList[0];
          trackingNumber = li?.logistics_no || li?.tracking_number || null;
          trackingCompany = li?.logistics_service || li?.carrier || null;
          trackingUrl = li?.tracking_url || null;
        }

        const itemIds = group.map(g => g.itemId);
        const orderIds = Array.from(new Set(group.map(g => g.orderId)));

        // Scoped UPDATE by item ids (not by ae_order_id alone)
        await dbQuery(
          `UPDATE commerce_order_items
           SET source_status = $1,
               metadata = metadata || jsonb_build_object(
                 'ae_status', $2::text,
                 'fulfillment_state', $3::text,
                 'tracking_number', $4::text,
                 'tracking_company', $5::text,
                 'tracking_url', $6::text,
                 'last_sync_at', $7::text
               )
           WHERE id = ANY($8::uuid[])`,
          [
            mapped.sourceStatus,
            aeStatus || null,
            mapped.fulfillmentState,
            trackingNumber,
            trackingCompany,
            trackingUrl,
            nowIso,
            itemIds,
          ]
        );

        // Upsert fulfillment_shipments row when we have tracking
        if (trackingNumber) {
          for (const orderId of orderIds) {
            await dbQuery(
              `INSERT INTO fulfillment_shipments (commerce_order_id, carrier, tracking_number, tracking_url, status, shipped_at, metadata)
               SELECT $1::uuid, $2::text, $3::text, $4::text,
                      CASE WHEN $5::boolean THEN 'delivered' ELSE 'in_transit' END,
                      now(),
                      jsonb_build_object('ae_order_id', $6::text, 'ae_status', $7::text)
               WHERE NOT EXISTS (
                 SELECT 1 FROM fulfillment_shipments
                 WHERE commerce_order_id = $1::uuid AND tracking_number = $3::text
               )`,
              [orderId, trackingCompany, trackingNumber, trackingUrl, mapped.terminal && aeStatus === "FINISH", aeOrderId, aeStatus || ""]
            );
            // If terminal, update existing shipment to delivered
            if (mapped.terminal && aeStatus === "FINISH") {
              await dbQuery(
                `UPDATE fulfillment_shipments
                 SET status = 'delivered', delivered_at = COALESCE(delivered_at, now())
                 WHERE commerce_order_id = $1::uuid AND tracking_number = $2::text`,
                [orderId, trackingNumber]
              );
            }
          }
        }

        // Promote commerce_orders.status when terminal and ALL items of that order are in terminal state
        if (mapped.orderStatus) {
          for (const orderId of orderIds) {
            await dbQuery(
              `UPDATE commerce_orders
               SET status = $1,
                   fulfilled_at = CASE WHEN $1 = 'fulfilled' THEN COALESCE(fulfilled_at, now()) ELSE fulfilled_at END,
                   cancelled_at = CASE WHEN $1 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END
               WHERE id = $2::uuid
                 AND NOT EXISTS (
                   SELECT 1 FROM commerce_order_items
                   WHERE order_id = $2::uuid
                     AND source_status NOT IN ('fulfilled','cancelled','failed')
                 )`,
              [mapped.orderStatus, orderId]
            );
          }
        }

        syncedCount += group.length;
      } catch (aeError: any) {
        errorCount++;
        logger.error({ err: aeError?.message || String(aeError), aeOrderId }, "[Cron sync-dropship-status] AE sync failed");
        // Record error in metadata so we can see it in DB
        try {
          await dbQuery(
            `UPDATE commerce_order_items
             SET metadata = metadata || jsonb_build_object(
               'last_sync_at', $1::text,
               'sync_error', $2::text
             )
             WHERE id = ANY($3::uuid[])`,
            [nowIso, String(aeError?.message || aeError).slice(0, 500), group.map(g => g.itemId)]
          );
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      syncedCount,
      errorCount,
      aeOrderCount: byAeOrder.size,
    });
  } catch (error: any) {
    logger.error({ err: error?.message || String(error) }, "[Sync Dropship Status Cron Error]");
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) { return runCron("sync-dropship-status", () => handleGET(req as any)); }
export const POST = GET;
