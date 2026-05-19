/**
 * Payouts rebalance cron.
 *
 * Authenticate via Bearer CRON_SECRET. Runs:
 *   1. For each creator with creator_kyc.status='approved':
 *      - gross_paid_minor   = SUM(tip.amount_minor where created_at <= now() - hold_days)
 *                           + SUM(ppv.paid_minor   where unlocked_at <= now() - hold_days)
 *      - gross_pending_minor= SUM(... where younger than hold_days)
 *      - paid_out_minor     = SUM(payout_requests.amount_minor where status='paid')
 *      - available_minor    = gross_paid_minor - paid_out_minor
 *      - upsert creator_balances
 *   2. For each creator with available_minor >= MIN_PAYOUT_MINOR and
 *      payout_method set and no open (pending/approved) payout_request,
 *      create a 'pending' payout_request for the available amount and
 *      decrement available_minor by that amount.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { adultQuery, adultTx } from "@/lib/adult/db";
import { writeAudit } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

const MIN_PAYOUT_MINOR = Number(process.env.ADULT_PAYOUT_MIN_MINOR || 5000); // 50 EUR

function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET || "";
  const got =
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
    req.headers.get("x-cron-secret") || "";
  if (!expected || !got) return false;
  const a = Buffer.from(expected), b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface CreatorRow {
  user_id: string;
  hold_days: number;
  payout_method: string | null;
  payout_account_ref: string | null;
  currency: string;
}

interface Sums { available: number; pending: number; lifetime: number }

async function sumsForCreator(userId: string, holdDays: number): Promise<Sums> {
  const { rows } = await adultQuery<{
    avail_tips: string; pend_tips: string;
    avail_ppv: string; pend_ppv: string;
    lifetime_tips: string; lifetime_ppv: string;
  }>(
    `WITH t AS (
       SELECT
         COALESCE(SUM(amount_minor) FILTER (WHERE created_at <= now() - ($2 || ' days')::interval), 0) AS avail_tips,
         COALESCE(SUM(amount_minor) FILTER (WHERE created_at >  now() - ($2 || ' days')::interval), 0) AS pend_tips,
         COALESCE(SUM(amount_minor), 0) AS lifetime_tips
       FROM adult.tips WHERE creator_user_id = $1
     ),
     p AS (
       SELECT
         COALESCE(SUM(pu.paid_minor) FILTER (WHERE pu.unlocked_at <= now() - ($2 || ' days')::interval), 0) AS avail_ppv,
         COALESCE(SUM(pu.paid_minor) FILTER (WHERE pu.unlocked_at >  now() - ($2 || ' days')::interval), 0) AS pend_ppv,
         COALESCE(SUM(pu.paid_minor), 0) AS lifetime_ppv
       FROM adult.ppv_unlocks pu
       JOIN adult.posts po ON po.id = pu.post_id
       WHERE po.creator_user_id = $1
     )
     SELECT t.avail_tips::text, t.pend_tips::text, t.lifetime_tips::text,
            p.avail_ppv::text,  p.pend_ppv::text,  p.lifetime_ppv::text
       FROM t, p`,
    [userId, String(holdDays)],
  );
  const r = rows[0]!;
  const available = Number(r.avail_tips) + Number(r.avail_ppv);
  const pending = Number(r.pend_tips) + Number(r.pend_ppv);
  const lifetime = Number(r.lifetime_tips) + Number(r.lifetime_ppv);
  return { available, pending, lifetime };
}

async function paidOutMinor(userId: string): Promise<number> {
  const { rows } = await adultQuery<{ s: string }>(
    `SELECT COALESCE(SUM(amount_minor),0)::text AS s
       FROM adult.payout_requests WHERE user_id = $1 AND status IN ('paid','approved','pending')`,
    [userId],
  );
  return Number(rows[0].s);
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return runRebalance();
}
export async function GET(req: Request) { return POST(req); }

async function runRebalance() {
  const { rows: creators } = await adultQuery<CreatorRow>(
    `SELECT k.user_id::text,
            COALESCE(b.hold_days, ${Number(process.env.ADULT_PAYOUT_HOLD_DAYS || 14)}) AS hold_days,
            b.payout_method,
            b.payout_account_ref,
            COALESCE(b.currency, 'EUR') AS currency
       FROM adult.creator_kyc k
       LEFT JOIN adult.creator_balances b ON b.user_id = k.user_id
      WHERE k.status = 'approved'`,
  );

  let rebalanced = 0;
  let payoutsCreated = 0;
  const errors: string[] = [];

  for (const c of creators) {
    try {
      const sums = await sumsForCreator(c.user_id, c.hold_days);
      const paid = await paidOutMinor(c.user_id);
      const available = Math.max(0, sums.available - paid);

      await adultQuery(
        `INSERT INTO adult.creator_balances
           (user_id, available_minor, pending_minor, lifetime_minor, currency, hold_days)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id) DO UPDATE SET
           available_minor = EXCLUDED.available_minor,
           pending_minor   = EXCLUDED.pending_minor,
           lifetime_minor  = EXCLUDED.lifetime_minor,
           updated_at      = now()`,
        [c.user_id, available, sums.pending, sums.lifetime, c.currency, c.hold_days],
      );
      rebalanced++;

      if (available >= MIN_PAYOUT_MINOR && c.payout_method && c.payout_account_ref) {
        // Check for an existing open request
        const { rows: open } = await adultQuery<{ id: string }>(
          `SELECT id::text FROM adult.payout_requests
            WHERE user_id = $1 AND status IN ('pending','approved') LIMIT 1`,
          [c.user_id],
        );
        if (open.length === 0) {
          await adultTx(async (client) => {
            await client.query(
              `INSERT INTO adult.payout_requests
                 (user_id, amount_minor, currency, method, destination_ref, status)
               VALUES ($1,$2,$3,$4,$5,'pending')`,
              [c.user_id, available, c.currency, c.payout_method, c.payout_account_ref],
            );
            await client.query(
              `UPDATE adult.creator_balances
                  SET available_minor = available_minor - $2,
                      updated_at = now()
                WHERE user_id = $1`,
              [c.user_id, available],
            );
          });
          payoutsCreated++;
          await writeAudit({
            actorUserId: null,
            action: "payout.request_created",
            targetType: "creator",
            targetId: c.user_id,
            afterState: { amountMinor: available, currency: c.currency, method: c.payout_method },
          }).catch(() => {});
        }
      }
    } catch (e: any) {
      errors.push(`${c.user_id}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    creators: creators.length,
    rebalanced,
    payoutsCreated,
    minPayoutMinor: MIN_PAYOUT_MINOR,
    errors,
  });
}
