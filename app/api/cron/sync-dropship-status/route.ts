import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { timingSafeEqual } from "crypto";
import { getDropshipOrderStatus } from "@/lib/aliexpress/client";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";

import { logger } from "@/lib/logger";
import { runCron } from "@/lib/cron/runCron";
export const dynamic = "force-dynamic";

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
    // 1. Fetch processing dropship items
    const { rows: processingItems } = await dbQuery(
      `SELECT id, order_id, metadata->>'ae_order_id' AS ae_order_id
       FROM commerce_order_items
       WHERE source_status = 'processing_dropship' 
         AND metadata->>'ae_order_id' IS NOT NULL`
    );

    if (processingItems.length === 0) {
      return NextResponse.json({ success: true, syncedCount: 0 });
    }

    const uniqueAeOrderIds = Array.from(new Set(processingItems.map(i => i.ae_order_id)));
    let syncedCount = 0;

    for (const aeOrderId of uniqueAeOrderIds) {
      try {
        const statusResult = await getDropshipOrderStatus(aeOrderId);
        // Map AliExpress status to internal status
        // Common AE status: WAIT_SELLER_SEND_GOODS, SELLER_PART_SEND_GOODS, WAIT_BUYER_ACCEPT_GOODS, FINISH
        const aeStatus = statusResult?.order_status;
        const logistics = statusResult?.logistics_status; // Wait for logistics tracking

        let newSourceStatus = 'processing_dropship';
        let fulfillmentStatus = 'processing';

        if (aeStatus === 'WAIT_BUYER_ACCEPT_GOODS' || aeStatus === 'SELLER_PART_SEND_GOODS') {
          newSourceStatus = 'shipped';
          fulfillmentStatus = 'shipped';
        } else if (aeStatus === 'FINISH') {
          newSourceStatus = 'delivered';
          fulfillmentStatus = 'delivered';
        } else if (aeStatus === 'IN_CANCEL' || aeStatus === 'RISK_CONTROL') {
          newSourceStatus = 'cancelled';
        }

        // Attempt to extract tracking number if shipped
        let trackingNumber = null;
        let trackingCompany = null;
        if (statusResult?.logistics_info_list) {
          const logInfo = statusResult.logistics_info_list[0];
          trackingNumber = logInfo?.logistics_no || null;
          trackingCompany = logInfo?.logistics_service || null;
        }

        await dbQuery(
          `UPDATE commerce_order_items
           SET source_status = $1,
               metadata = metadata || jsonb_build_object(
                 'ae_status', $2::text,
                 'tracking_number', $3::text,
                 'tracking_company', $4::text
               )
           WHERE metadata->>'ae_order_id' = $5`,
          [newSourceStatus, aeStatus, trackingNumber, trackingCompany, aeOrderId]
        );

        // Update main order if all items are shipped
        if (fulfillmentStatus !== 'processing') {
          await dbQuery(
            `UPDATE commerce_orders
             SET fulfillment_status = $1,
                 metadata = metadata || jsonb_build_object(
                   'tracking_number', $2::text,
                   'tracking_company', $3::text
                 )
             WHERE id = (
               SELECT order_id FROM commerce_order_items WHERE metadata->>'ae_order_id' = $4 LIMIT 1
             )`,
            [fulfillmentStatus, trackingNumber, trackingCompany, aeOrderId]
          );
        }

        syncedCount++;
      } catch (aeError: any) {
        logger.error({ err: aeError }, `[Cron] AE sync failed for ae_order_id ${aeOrderId}:`);
      }
    }

    return NextResponse.json({
      success: true,
      syncedCount
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Sync Dropship Status Cron Error]:");
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const POST = GET;

export async function GET(req: Request) { return runCron("sync-dropship-status", () => handleGET(req as any)); }
