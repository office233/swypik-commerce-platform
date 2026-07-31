import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { timingSafeEqual, randomUUID } from "crypto";
import { placeDropshipOrder } from "@/lib/aliexpress/client";
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

  const MAX_ATTEMPTS = 3;
  const CLAIM_TTL_MINUTES = 10;
  const BATCH_SIZE = 20;

  try {
    // ATOMIC CLAIM: mark pending items as "in-flight" with a lock token.
    // SKIP LOCKED prevents two concurrent crons from claiming the same row.
    // The claim is bounded by attempts < MAX_ATTEMPTS to avoid infinite retries.
    const claimToken = `cron_${Date.now()}_${randomUUID()}`;
    const claimedAt = new Date().toISOString();

    const { rows: pendingItems } = await dbQuery(
      `WITH claimed AS (
         SELECT coi.id
         FROM commerce_order_items coi
         JOIN commerce_orders co ON co.id = coi.order_id
         WHERE coi.source_status = 'pending_dropship'
           AND co.status = 'paid'
           AND COALESCE((co.metadata->>'fraud_block')::boolean, false) = false
           AND NOT EXISTS (
             SELECT 1 FROM users u
              WHERE u.id = co.buyer_user_id
                AND (u.metadata->'fraud_user_block'->>'blocked')::boolean = true
           )
           AND COALESCE((coi.metadata->>'dropship_attempts')::int, 0) < $3
           AND (
             coi.metadata->>'dropship_claim_at' IS NULL
             OR (coi.metadata->>'dropship_claim_at')::timestamptz < now() - ($4 || ' minutes')::interval
           )
         ORDER BY coi.created_at
         LIMIT $5
         FOR UPDATE SKIP LOCKED
       )
       UPDATE commerce_order_items coi
       SET metadata = coi.metadata
         || jsonb_build_object('dropship_claim_token', $1::text, 'dropship_claim_at', $2::text)
       FROM claimed
       WHERE coi.id = claimed.id
       RETURNING
         coi.id AS item_id,
         coi.order_id,
         coi.title,
         coi.quantity,
         coi.metadata AS item_metadata,
         (SELECT co.metadata FROM commerce_orders co WHERE co.id = coi.order_id) AS order_metadata,
         (SELECT mp.supplier_product_id FROM marketplace_products mp WHERE mp.id::text = coi.metadata->>'pg_id') AS ae_product_id,
         (SELECT mpv.sku FROM marketplace_product_variants mpv WHERE mpv.sku = coi.metadata->>'sku_id') AS ae_sku_id`,
      [claimToken, claimedAt, MAX_ATTEMPTS, CLAIM_TTL_MINUTES, BATCH_SIZE]
    );

    if (pendingItems.length === 0) {
      return NextResponse.json({ success: true, processedCount: 0 });
    }

    logger.info(`[Cron] Claimed ${pendingItems.length} items with token ${claimToken}`);

    const itemsByOrder: Record<string, typeof pendingItems> = {};
    for (const item of pendingItems) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }

    let processedCount = 0;
    let failedCount = 0;

    for (const [orderId, items] of Object.entries(itemsByOrder)) {
      const claimedItemIds = items.map(i => i.item_id);
      const orderMetadata = items[0].order_metadata || {};
      const shippingAddress = orderMetadata.shipping_address;

      // IDEMPOTENCY GUARD: if any item already has ae_order_id, skip this order entirely.
      // This catches the case where a previous run succeeded at AE but failed before DB commit.
      const alreadyPlaced = items.find(i => (i.item_metadata as any)?.ae_order_id);
      if (alreadyPlaced) {
        logger.warn(`[Cron] Order ${orderId} already has ae_order_id=${(alreadyPlaced.item_metadata as any).ae_order_id}, finalizing without re-placing.`);
        await dbQuery(
          `UPDATE commerce_order_items
           SET source_status = 'processing_dropship',
               metadata = metadata - 'dropship_claim_token' - 'dropship_claim_at'
           WHERE id = ANY($1::uuid[]) AND metadata->>'dropship_claim_token' = $2`,
          [claimedItemIds, claimToken]
        );
        processedCount += items.length;
        continue;
      }

      if (!shippingAddress) {
        logger.error(`[Cron] Order ${orderId} has no shipping address.`);
        await releaseClaimWithError(claimedItemIds, claimToken, "missing_shipping_address");
        failedCount += items.length;
        continue;
      }

      // Sanity: every item must have an AE product id
      const missingProductId = items.find(i => !i.ae_product_id);
      if (missingProductId) {
        logger.error(`[Cron] Order ${orderId} item ${missingProductId.item_id} missing ae_product_id.`);
        await releaseClaimWithError(claimedItemIds, claimToken, `missing_ae_product_id:${missingProductId.item_id}`);
        failedCount += items.length;
        continue;
      }

      const aeItems = items.map(item => ({
        ae_product_id: item.ae_product_id,
        ae_sku_attr: item.ae_sku_id,
        quantity: item.quantity,
      }));

      const { rows: eligibilityRows } = await dbQuery(
        `SELECT
           co.status AS order_status,
           COALESCE((co.metadata->>'fraud_block')::boolean, false) AS fraud_block,
           EXISTS (
             SELECT 1 FROM users u
              WHERE u.id = co.buyer_user_id
                AND (u.metadata->'fraud_user_block'->>'blocked')::boolean = true
           ) AS buyer_fraud_block,
           COUNT(*) FILTER (
             WHERE coi.source_status = 'pending_dropship'
               AND coi.metadata->>'dropship_claim_token' = $2
           ) AS claimed_pending_count
         FROM commerce_orders co
         JOIN commerce_order_items coi ON coi.order_id = co.id AND coi.id = ANY($1::uuid[])
         WHERE co.id = $3
         GROUP BY co.id`,
        [claimedItemIds, claimToken, orderId]
      );
      const eligibility = eligibilityRows[0];
      const claimedPendingCount = Number(eligibility?.claimed_pending_count || 0);
      if (
        !eligibility ||
        eligibility.order_status !== "paid" ||
        eligibility.fraud_block ||
        eligibility.buyer_fraud_block ||
        claimedPendingCount !== claimedItemIds.length
      ) {
        logger.warn(
          {
            cron: "process-dropship",
            order_id: orderId,
            order_status: eligibility?.order_status,
            fraud_block: eligibility?.fraud_block,
            buyer_fraud_block: eligibility?.buyer_fraud_block,
            claimed_pending_count: claimedPendingCount,
            claimed_count: claimedItemIds.length,
          },
          "skipping dropship order because eligibility changed before AE placement"
        );
        await releaseClaimWithoutRetry(claimedItemIds, claimToken, "order_not_eligible_before_ae_placement");
        failedCount += items.length;
        continue;
      }

      try {
        logger.info({ cron: "process-dropship", order_id: orderId, items_count: aeItems.length }, "placing dropship order on AE");
        const result = await placeDropshipOrder(orderId, shippingAddress, aeItems);

        const aeOrderId = result?.order_list?.[0] || result?.aliexpress_order_id || null;

        if (!aeOrderId) {
          const resultKeys = result && typeof result === "object" ? Object.keys(result).slice(0, 20) : [];
          logger.error(
            { cron: "process-dropship", order_id: orderId, result_keys: resultKeys },
            "AE order response missing order id"
          );
          throw new Error("AE order response missing order id");
        }

        // FINAL UPDATE: only touch items we claimed (by token), not all order items.
        // This prevents wiping items added later or claimed by another worker.
        await dbQuery(
          `UPDATE commerce_order_items
           SET source_status = 'processing_dropship',
               metadata = (metadata - 'dropship_claim_token' - 'dropship_claim_at')
                 || jsonb_build_object(
                      'ae_order_id', $2::text,
                      'ae_placed_at', now()::text
                    )
           WHERE id = ANY($1::uuid[]) AND metadata->>'dropship_claim_token' = $3`,
          [claimedItemIds, aeOrderId, claimToken]
        );
        processedCount += items.length;
      } catch (aeError: any) {
        logger.error({ err: aeError }, `[Cron] AE auto-ordering failed for order ${orderId}:`);
        await releaseClaimWithError(claimedItemIds, claimToken, String(aeError?.message || aeError).slice(0, 500));
        failedCount += items.length;
      }
    }

    return NextResponse.json({
      success: true,
      processedCount,
      failedCount,
      claimedCount: pendingItems.length,
      claimToken,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Process Dropship Cron Error]:");
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// Release a claim and record the error. After MAX_ATTEMPTS the item is marked as 'failed'
// so it stops being retried automatically and requires manual intervention.
async function releaseClaimWithError(itemIds: string[], claimToken: string, errorMessage: string) {
  const MAX_ATTEMPTS = 3;
  await dbQuery(
    `UPDATE commerce_order_items
     SET
       metadata = (metadata - 'dropship_claim_token' - 'dropship_claim_at')
         || jsonb_build_object(
              'dropship_attempts', COALESCE((metadata->>'dropship_attempts')::int, 0) + 1,
              'last_dropship_error', $3::text,
              'last_dropship_error_at', now()::text
            ),
       source_status = CASE
         WHEN COALESCE((metadata->>'dropship_attempts')::int, 0) + 1 >= $4
           THEN 'failed'
         ELSE 'pending_dropship'
       END
     WHERE id = ANY($1::uuid[]) AND metadata->>'dropship_claim_token' = $2`,
    [itemIds, claimToken, errorMessage, MAX_ATTEMPTS]
  );
}

async function releaseClaimWithoutRetry(itemIds: string[], claimToken: string, reason: string) {
  await dbQuery(
    `UPDATE commerce_order_items
     SET metadata = (metadata - 'dropship_claim_token' - 'dropship_claim_at')
       || jsonb_build_object(
            'last_dropship_skip_reason', $3::text,
            'last_dropship_skip_at', now()::text
          )
     WHERE id = ANY($1::uuid[]) AND metadata->>'dropship_claim_token' = $2`,
    [itemIds, claimToken, reason]
  );
}

export const POST = GET;

export async function GET(req: Request) { return runCron("process-dropship", () => handleGET(req as any)); }
