/**
 * Cron Job: Automatic Seller Payouts (Stripe Transfers)
 *
 * Runs on a schedule and transfers money to sellers whose orders have been
 * fulfilled for more than 14 days (return window expired).
 *
 * Flow:
 *   1. Query commerce_order_items where source_status = 'fulfilled',
 *      updated_at older than 14 days, and payout_status IS NULL.
 *   2. Extract seller_payout_cents and seller_id from the item's metadata.
 *   3. Join with sellers table to get the stripe_account_id.
 *   4. Execute stripe.transfers.create for each eligible item.
 *   5. Update payout_status = 'paid' on success.
 *   6. Per-item try/catch so one failure doesn't block others.
 */

import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";
import { dbQuery } from "@/lib/db";
import { getStripe } from "@/lib/stripe/checkout";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const RETURN_WINDOW_DAYS = 14;

export async function GET(req: Request) {
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
     WHERE coi.source_status = 'fulfilled'
       AND coi.updated_at < NOW() - ($1 || ' days')::interval
       AND (coi.metadata->>'seller_payout_status' IS NULL OR coi.metadata->>'seller_payout_status' = 'pending')
       AND coi.metadata->>'seller_payout_cents' IS NOT NULL
       AND (coi.metadata->>'seller_payout_cents')::int > 0`,
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
     WHERE coi.source_status = 'fulfilled'
       AND coi.updated_at < NOW() - ($1 || ' days')::interval
       AND coi.creator_id IS NOT NULL
       AND (coi.payout_status IS NULL OR coi.payout_status = 'pending')
       AND coi.commissionable_amount_cents > 0`,
    [String(RETURN_WINDOW_DAYS)]
  );

  const stripe = getStripe();
  let paidSellerCount = 0;
  let paidCreatorCount = 0;

  // 4. Process Seller Payouts
  for (const item of sellerItems) {
    try {
      if (!item.stripe_account_id) {
        await dbQuery(
          `UPDATE commerce_order_items SET metadata = coalesce(metadata, '{}'::jsonb) || '{"seller_payout_status":"no_account"}'::jsonb WHERE id = $1`,
          [item.item_id]
        );
        continue;
      }
      const transfer = await stripe.transfers.create({
        amount: item.seller_payout_cents,
        currency: "ron",
        destination: item.stripe_account_id,
        description: `Seller payout for "${item.title}"`,
        metadata: { order_id: item.order_id, item_id: item.item_id, type: 'seller' },
      });
      await dbQuery(
        `UPDATE commerce_order_items SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('seller_payout_status', 'paid', 'seller_transfer_id', $2::text) WHERE id = $1`,
        [item.item_id, transfer.id]
      );
      paidSellerCount++;
    } catch (e: any) {
      await dbQuery(
        `UPDATE commerce_order_items SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('seller_payout_status', 'failed') WHERE id = $1`,
        [item.item_id]
      );
    }
  }

  // 5. Process Creator Payouts
  for (const item of creatorItems) {
    try {
      const creatorPayoutCents = Math.max(1, Math.round(item.commissionable_cents * 0.05)); // 5% commision
      
      const transfer = await stripe.transfers.create({
        amount: creatorPayoutCents,
        currency: "ron",
        destination: item.stripe_account_id!,
        description: `Creator commission for "${item.title}"`,
        metadata: { order_id: item.order_id, item_id: item.item_id, type: 'creator' },
      });

      await dbQuery(
        `UPDATE commerce_order_items 
         SET payout_status = 'paid', 
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('creator_transfer_id', $2::text) 
         WHERE id = $1`,
        [item.item_id, transfer.id]
      );

      await dbQuery(
        `INSERT INTO connect_transfers
           (connect_account_id, provider, provider_transfer_id, destination_account_id, status, currency, amount_cents, submitted_at, completed_at, metadata)
         VALUES
           ((SELECT id FROM creator_connect_accounts WHERE provider_account_id = $1 LIMIT 1), 'stripe', $2, $1, 'succeeded', 'RON', $3, NOW(), NOW(), jsonb_build_object('item_id', $4::text))`,
        [item.stripe_account_id, transfer.id, creatorPayoutCents, item.item_id]
      );
      paidCreatorCount++;
    } catch (e: any) {
      await dbQuery(
        `UPDATE commerce_order_items SET payout_status = 'failed' WHERE id = $1`,
        [item.item_id]
      );
    }
  }

  return NextResponse.json({
    success: true,
    sellerPayouts: paidSellerCount,
    creatorPayouts: paidCreatorCount
  });
}

export const POST = GET;
