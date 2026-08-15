/**
 * Cron Job: Automatic Seller Payouts (Stripe Transfers)
 *
 * Runs on a schedule and transfers money to sellers / creators whose orders
 * have been fulfilled for more than 14 days (return window expired).
 *
 * Concurrency safety:
 *   - Each candidate row is "claimed" via an atomic single-row UPDATE that
 *     stamps a `*_payout_processing_at` timestamp into metadata. Concurrent
 *     cron invocations (or retries) racing on the same row will see only one
 *     successful UPDATE; the loser skips the item.
 *   - A claim "expires" after CLAIM_TTL_MINUTES so a row stuck mid-process
 *     (e.g. crashed worker) is eventually retried.
 *   - NOTE: payout_status CHECK constraint does not include a 'processing'
 *     value (see 20260514_0003_order_item_payout_status_check.sql), so we
 *     mark in-flight rows via a metadata timestamp rather than a status
 *     transition. If a 'processing' state is added later, switch to
 *     `UPDATE ... SET payout_status='processing' WHERE id=$1 AND payout_status IN (NULL,'pending') RETURNING ...`.
 *
 * Idempotency:
 *   - Every Stripe `transfers.create` call passes a deterministic
 *     `idempotencyKey` scoped per item + payout type. A network retry of the
 *     same logical payout will return the original Transfer instead of moving
 *     money twice.
 *
 * Refund safety:
 *   - The candidate query joins `commerce_orders` and excludes orders whose
 *     status is `refunded`, `cancelled`, `return_requested`, or `failed` so
 *     we never pay out for an order that was reversed after fulfillment.
 *   - The per-item `payout_status` / `seller_payout_status` filters already
 *     exclude items individually marked `refunded`.
 */

import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import { dbQuery } from "@/lib/db";
import { CREATOR_COMMISSION_BPS, applyBps } from "@/lib/config/commerce";
import { getStripe } from "@/lib/stripe/checkout";
import { timingSafeEqual } from "crypto";
import { runCron, cronSkippedResponse } from "@/lib/cron/runCron";

export const dynamic = "force-dynamic";

// 2026-08-11 (audit): fereastra de retur configurabilă prin env — schimbarea
// politicii de retur nu mai necesită redeploy de cod.
const RETURN_WINDOW_DAYS =
  Number(process.env.RETURN_WINDOW_DAYS) > 0
    ? Math.trunc(Number(process.env.RETURN_WINDOW_DAYS))
    : 14;
// How long a claim is considered "in-flight" before another worker may retry it.
const CLAIM_TTL_MINUTES = 10;

async function handleGET(req: Request) {
  if (!isEnabled("stripeConnect")) return frozenResponse("stripeConnect");
  // 1. Authorization
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret");
  const cronSecretHeader =
    req.headers.get("cron-secret") || req.headers.get("CRON_SECRET");

  const providedSecret = token || cronSecretHeader;

  const expected = process.env.CRON_SECRET;
  if (!expected || !providedSecret ||
    Buffer.byteLength(providedSecret) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Query eligible items for Seller payouts (local seller)
  const { rows: sellerItems } = await dbQuery<{
    item_id: string;
    order_id: string;
    title: string;
    seller_payout_cents: number;
    seller_id: string;
    stripe_account_id: string | null;
  }>(
    `SELECT
       coi.id              AS item_id,
       coi.order_id,
       coi.title,
       (coi.metadata->>'seller_payout_cents')::int  AS seller_payout_cents,
       coi.metadata->>'seller_id'                   AS seller_id,
       COALESCE(
         s.stripe_account_id,
         s.metadata->>'stripe_account_id'
       ) AS stripe_account_id
     FROM commerce_order_items coi
     JOIN sellers s
       ON s.id::text = coi.metadata->>'seller_id'
     LEFT JOIN commerce_orders co
       ON co.id = coi.order_id
     WHERE coi.source_status = 'fulfilled'
       AND coi.updated_at < NOW() - ($1 || ' days')::interval
       AND (coi.metadata->>'seller_payout_status' IS NULL OR coi.metadata->>'seller_payout_status' = 'pending')
       AND coi.metadata->>'seller_payout_cents' IS NOT NULL
       AND (coi.metadata->>'seller_payout_cents')::int > 0
       AND (co.status IS NULL OR co.status NOT IN ('refunded','cancelled','return_requested','failed'))
      AND s.status = 'active'
      AND s.stripe_payouts_enabled = true
      AND COALESCE((s.metadata->>'fraud_block')::boolean, false) = false
      AND COALESCE((s.metadata->'fraud_user_block'->>'blocked')::boolean, false) = false`,
    [String(RETURN_WINDOW_DAYS)]
  );

  // 3. Query eligible items for Creator payouts
  const { rows: creatorItems } = await dbQuery<{
    item_id: string;
    order_id: string;
    title: string;
    creator_id: string;
    commissionable_cents: number;
    stripe_account_id: string | null;
  }>(
    `SELECT
       coi.id AS item_id,
       coi.order_id,
       coi.title,
       coi.creator_id::text AS creator_id,
       coi.commissionable_amount_cents AS commissionable_cents,
       cca.provider_account_id AS stripe_account_id
     FROM commerce_order_items coi
     JOIN creator_connect_accounts cca
       ON cca.creator_id = coi.creator_id AND cca.payouts_enabled = true AND cca.account_status = 'active'
     JOIN users creator_user
       ON creator_user.id = coi.creator_id
     LEFT JOIN commerce_orders co
       ON co.id = coi.order_id
     WHERE coi.source_status = 'fulfilled'
       AND coi.updated_at < NOW() - ($1 || ' days')::interval
       AND coi.creator_id IS NOT NULL
       AND (coi.payout_status IS NULL OR coi.payout_status = 'pending')
       AND coi.commissionable_amount_cents > 0
      AND (co.status IS NULL OR co.status NOT IN ('refunded','cancelled','return_requested','failed'))
      AND COALESCE((creator_user.metadata->'fraud_user_block'->>'blocked')::boolean, false) = false`,
    [String(RETURN_WINDOW_DAYS)]
  );

  const stripe = getStripe();
  let paidSellerCount = 0;
  let paidCreatorCount = 0;
  let skippedClaimedCount = 0;

  // 4. Process Seller Payouts
  for (const item of sellerItems) {
    // Atomic claim: only one worker wins this UPDATE. The WHERE clause
    // re-evaluates under a row lock, so concurrent invocations cannot both
    // succeed even if the initial SELECT returned the same row to both.
    const claim = await dbQuery(
      `UPDATE commerce_order_items
         SET metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('seller_payout_processing_at', NOW()::text)
       WHERE id = $1
         AND (metadata->>'seller_payout_status' IS NULL OR metadata->>'seller_payout_status' = 'pending')
         AND COALESCE(
               NULLIF(metadata->>'seller_payout_processing_at','')::timestamptz,
               'epoch'::timestamptz
             ) < NOW() - ($2 || ' minutes')::interval
         AND EXISTS (
           SELECT 1
             FROM sellers s
             LEFT JOIN commerce_orders co ON co.id = commerce_order_items.order_id
            WHERE s.id::text = commerce_order_items.metadata->>'seller_id'
              AND s.status = 'active'
              AND s.stripe_payouts_enabled = true
              AND COALESCE((s.metadata->>'fraud_block')::boolean, false) = false
              AND COALESCE((s.metadata->'fraud_user_block'->>'blocked')::boolean, false) = false
              AND (co.status IS NULL OR co.status NOT IN ('refunded','cancelled','return_requested','failed'))
         )
       RETURNING id`,
      [item.item_id, String(CLAIM_TTL_MINUTES)]
    );
    if (claim.rowCount === 0) {
      skippedClaimedCount++;
      continue;
    }

    try {
      if (!item.stripe_account_id) {
        await dbQuery(
          `UPDATE commerce_order_items
             SET metadata = coalesce(metadata, '{}'::jsonb)
                          || '{"seller_payout_status":"no_account"}'::jsonb
           WHERE id = $1`,
          [item.item_id]
        );
        continue;
      }
      // FIX 2026-07-31: scriem intentia INAINTE de transfer. La crash intre
      // transfer si UPDATE-ul final, reconciliem dupa idempotency key (Stripe
      // returneaza acelasi transfer la retry) iar starea 'transfer_initiated'
      // e vizibila in DB in loc sa para ca item-ul n-a fost atins.
      await dbQuery(
        `UPDATE commerce_order_items
           SET metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'seller_payout_status', 'transfer_initiated',
                             'seller_idempotency_key', $2::text
                           )
         WHERE id = $1`,
        [item.item_id, `swypik:seller-payout:${item.item_id}`]
      );
      const transfer = await stripe.transfers.create(
        {
          amount: item.seller_payout_cents,
          currency: "ron",
          destination: item.stripe_account_id,
          description: `Seller payout for "${item.title}"`,
          metadata: { order_id: item.order_id, item_id: item.item_id, type: 'seller' },
        },
        { idempotencyKey: `swypik:seller-payout:${item.item_id}` }
      );
      await dbQuery(
        `UPDATE commerce_order_items
           SET metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'seller_payout_status', 'paid',
                             'seller_transfer_id', $2::text,
                             'seller_paid_at', NOW()::text
                           )
         WHERE id = $1`,
        [item.item_id, transfer.id]
      );
      paidSellerCount++;
    } catch (e: any) {
      console.error(`[payout-cron] seller payout failed for item ${item.item_id}:`, e?.message || e);
      await dbQuery(
        `UPDATE commerce_order_items
           SET metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'seller_payout_status', 'failed',
                             'seller_payout_error', $2::text,
                             'seller_payout_failed_at', NOW()::text
                           )
         WHERE id = $1`,
        [item.item_id, String(e?.message || 'unknown_error').slice(0, 500)]
      );
    }
  }

  // 5. Process Creator Payouts
  for (const item of creatorItems) {
    // Atomic claim — see seller loop for rationale.
    const claim = await dbQuery(
      `UPDATE commerce_order_items
         SET metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('creator_payout_processing_at', NOW()::text)
       WHERE id = $1
         AND (payout_status IS NULL OR payout_status = 'pending')
         AND COALESCE(
               NULLIF(metadata->>'creator_payout_processing_at','')::timestamptz,
               'epoch'::timestamptz
             ) < NOW() - ($2 || ' minutes')::interval
         AND EXISTS (
           SELECT 1
             FROM creator_connect_accounts cca
             JOIN users creator_user ON creator_user.id = commerce_order_items.creator_id
             LEFT JOIN commerce_orders co ON co.id = commerce_order_items.order_id
            WHERE cca.creator_id = commerce_order_items.creator_id
              AND cca.payouts_enabled = true
              AND cca.account_status = 'active'
              AND COALESCE((creator_user.metadata->'fraud_user_block'->>'blocked')::boolean, false) = false
              AND (co.status IS NULL OR co.status NOT IN ('refunded','cancelled','return_requested','failed'))
         )
       RETURNING id`,
      [item.item_id, String(CLAIM_TTL_MINUTES)]
    );
    if (claim.rowCount === 0) {
      skippedClaimedCount++;
      continue;
    }

    try {
      const creatorPayoutCents = Math.max(1, applyBps(item.commissionable_cents, CREATOR_COMMISSION_BPS));

      // Intentie pre-transfer (vezi comentariul din bucla seller).
      await dbQuery(
        `UPDATE commerce_order_items
           SET metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'creator_payout_status', 'transfer_initiated',
                             'creator_idempotency_key', $2::text
                           )
         WHERE id = $1`,
        [item.item_id, `swypik:creator-payout:${item.item_id}`]
      );
      const transfer = await stripe.transfers.create(
        {
          amount: creatorPayoutCents,
          currency: "ron",
          destination: item.stripe_account_id!,
          description: `Creator commission for "${item.title}"`,
          metadata: { order_id: item.order_id, item_id: item.item_id, type: 'creator' },
        },
        { idempotencyKey: `swypik:creator-payout:${item.item_id}` }
      );

      await dbQuery(
        `UPDATE commerce_order_items
           SET payout_status = 'paid',
               metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'creator_transfer_id', $2::text,
                             'creator_paid_at', NOW()::text
                           )
         WHERE id = $1`,
        [item.item_id, transfer.id]
      );

      await dbQuery(
        `INSERT INTO connect_transfers
           (connect_account_id, provider, provider_transfer_id, destination_account_id, status, currency, amount_cents, submitted_at, completed_at, metadata)
         VALUES
           ((SELECT id FROM creator_connect_accounts WHERE provider_account_id = $1 LIMIT 1), 'stripe', $2, $1, 'succeeded', 'RON', $3, NOW(), NOW(), jsonb_build_object('item_id', $4::text))
         ON CONFLICT (provider, provider_transfer_id) DO NOTHING`,
        [item.stripe_account_id, transfer.id, creatorPayoutCents, item.item_id]
      );
      paidCreatorCount++;
    } catch (e: any) {
      console.error(`[payout-cron] creator payout failed for item ${item.item_id}:`, e?.message || e);
      await dbQuery(
        `UPDATE commerce_order_items
           SET payout_status = 'failed',
               metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'creator_payout_error', $2::text,
                             'creator_payout_failed_at', NOW()::text
                           )
         WHERE id = $1`,
        [item.item_id, String(e?.message || 'unknown_error').slice(0, 500)]
      );
    }
  }

  return {
    success: true,
    sellerPayouts: paidSellerCount,
    creatorPayouts: paidCreatorCount,
    skippedClaimed: skippedClaimedCount,
  };
}

export async function GET(req: Request) {
  const result = await runCron("process-payouts", () => handleGET(req as any));
  if (result === null) return cronSkippedResponse("process-payouts");
  // Auth failures return a NextResponse — propagate it as-is; otherwise serialize the plain result for cron observability.
  if (result instanceof Response) return result;
  return NextResponse.json(result);
}

export const POST = GET;
