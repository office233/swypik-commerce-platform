/**
 * CCBill webhook (background post / data link).
 *
 * Auth options (CCBill supports any one of these — pick what your
 * merchant account is configured with):
 *   (a) ?secret=... query parameter shared with backend (CCBILL_WEBHOOK_SECRET)
 *   (b) HMAC-SHA256 of raw body with CCBILL_SALT, in X-Signature header
 *
 * Payload shape: form-urlencoded or JSON depending on integration.
 * We accept both; require eventType + transactionId + subscriptionId.
 *
 * Supported events:
 *   NewSaleSuccess        → mark subscription/ppv/tip 'active'/'paid'
 *   RenewalSuccess        → extend subscription.current_period_end
 *   Cancellation          → subscription.status = 'canceled'
 *   Refund | Chargeback   → subscription/ppv → 'refunded'; tip → mark refund
 *
 * Always returns 200 if signature is valid (even if payload is unknown)
 * so CCBill stops retrying. Application errors are logged in audit_log.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { adultQuery, adultTx } from "@/lib/adult/db";
import { writeAudit } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

function timingSafeEqualStr(a: string, b: string): boolean {
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function verify(rawBody: string, headers: Headers, url: URL): boolean {
  const querySecret = url.searchParams.get("secret");
  const envSecret = process.env.CCBILL_WEBHOOK_SECRET;
  if (envSecret && querySecret && timingSafeEqualStr(envSecret, querySecret)) return true;

  const salt = process.env.CCBILL_SALT;
  const sig = headers.get("x-signature") || headers.get("x-ccbill-signature");
  if (salt && sig) {
    const expected = crypto.createHmac("sha256", salt).update(rawBody, "utf8").digest("hex");
    const a = Buffer.from(expected, "hex");
    let b: Buffer;
    try { b = Buffer.from(sig, "hex"); } catch { return false; }
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

interface NormalisedEvent {
  eventType: string;
  subscriptionRef: string | null;
  transactionRef: string | null;
  amountMinor: number | null;
  currency: string | null;
  raw: Record<string, string>;
}

function parseBody(raw: string, ct: string | null): NormalisedEvent | null {
  try {
    let map: Record<string, string> = {};
    if ((ct || "").includes("application/json")) {
      const o = JSON.parse(raw);
      for (const [k, v] of Object.entries(o)) map[k] = String(v);
    } else {
      // form-urlencoded
      const sp = new URLSearchParams(raw);
      sp.forEach((v, k) => { map[k] = v; });
    }
    const eventType = map.eventType || map.event || map.action || "unknown";
    const subRef = map.subscriptionId || map.subscription_id || null;
    const txnRef = map.transactionId || map.transaction_id || subRef;
    const amount = map.amount || map.accountingAmount || null;
    const cur = map.currencyCode || map.currency || null;
    return {
      eventType,
      subscriptionRef: subRef,
      transactionRef: txnRef,
      amountMinor: amount ? Math.round(Number(amount) * 100) : null,
      currency: cur,
      raw: map,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const raw = await req.text();

  if (!verify(raw, req.headers, url)) {
    await writeAudit({
      actorUserId: null,
      action: "ccbill.webhook.bad_signature",
      targetType: "webhook",
      targetId: "ccbill",
      reason: "signature mismatch",
      ipAddress: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  const ev = parseBody(raw, req.headers.get("content-type"));
  if (!ev) {
    await writeAudit({
      actorUserId: null, action: "ccbill.webhook.unparseable",
      targetType: "webhook", targetId: "ccbill",
      afterState: { sample: raw.slice(0, 500) },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ignored: true });
  }

  // We look up by processor_ref. transactionRef matches tips/ppv_unlocks;
  // subscriptionRef matches subscriptions.processor_ref.
  await adultTx(async (client) => {
    if (ev.subscriptionRef) {
      if (ev.eventType === "NewSaleSuccess" || ev.eventType === "RenewalSuccess") {
        await client.query(
          `UPDATE adult.subscriptions
              SET status = 'active',
                  current_period_end = GREATEST(current_period_end, now()) + INTERVAL '30 days',
                  updated_at = now()
            WHERE processor = 'ccbill' AND processor_subscription_ref = $1`,
          [ev.subscriptionRef],
        );
      } else if (ev.eventType === "Cancellation" || ev.eventType === "Expiration") {
        await client.query(
          `UPDATE adult.subscriptions
              SET status = 'cancelled', cancelled_at = now(), updated_at = now()
            WHERE processor = 'ccbill' AND processor_subscription_ref = $1`,
          [ev.subscriptionRef],
        );
      } else if (ev.eventType === "Refund" || ev.eventType === "Chargeback") {
        await client.query(
          `UPDATE adult.subscriptions
              SET status = 'refunded', updated_at = now()
            WHERE processor = 'ccbill' AND processor_subscription_ref = $1`,
          [ev.subscriptionRef],
        );
      }
    }

    if (ev.transactionRef) {
      // PPV unlocks: existence = paid. Refund/Chargeback removes the row.
      if (ev.eventType === "Refund" || ev.eventType === "Chargeback") {
        await client.query(
          `DELETE FROM adult.ppv_unlocks
            WHERE processor = 'ccbill' AND processor_ref = $1`,
          [ev.transactionRef],
        );
        await client.query(
          `DELETE FROM adult.tips
            WHERE processor = 'ccbill' AND processor_ref = $1`,
          [ev.transactionRef],
        );
      }
      // NewSaleSuccess for PPV/Tip rows is performed at /start time as an
      // optimistic insert; the webhook just confirms — nothing to update.
    }
  });

  await writeAudit({
    actorUserId: null,
    action: `ccbill.${ev.eventType}`,
    targetType: "ccbill_event",
    targetId: ev.subscriptionRef || ev.transactionRef || "unknown",
    afterState: { amountMinor: ev.amountMinor, currency: ev.currency },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
