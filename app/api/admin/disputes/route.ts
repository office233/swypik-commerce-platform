/**
 * Admin: list and submit evidence for Stripe disputes (chargebacks).
 *
 *   GET  /api/admin/disputes
 *   POST /api/admin/disputes  body:{disputeId, evidence:{...}, submit?:boolean}
 *
 * evidence keys mirror Stripe Dispute.evidence fields (product_description,
 * customer_communication, shipping_documentation_str, service_documentation_str,
 * receipt, refund_policy_disclosure, uncategorized_text, etc). When submit=true
 * we POST to Stripe; otherwise we save as draft locally only.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hasAdminSession, isAdminRequest } from "@/lib/security/admin-auth";
import { getStripe } from "@/lib/stripe/checkout";
import { logger } from "@/lib/logger";
import { scoreDispute } from "@/lib/stripe/dispute-win-score";

export const dynamic = "force-dynamic";

type DisputeRow = {
  id: string;
  dispute_id: string;
  charge_id: string;
  payment_intent_id: string | null;
  order_id: string | null;
  amount_cents: number;
  currency: string;
  reason: string | null;
  status: string;
  evidence_due_by: string | null;
  evidence_submitted: boolean;
  evidence_submitted_at: string | null;
  evidence_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  buyer_email: string | null;
  order_total_cents: number | null;
};

export async function GET(req: Request) {
  if (!(await hasAdminSession()) && !(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "all";

  const args: Array<string | number> = [];
  let where = "1=1";
  if (status === "needs_response") {
    where = "d.status IN ('needs_response','warning_needs_response')";
  } else if (status === "under_review") {
    where = "d.status IN ('under_review','warning_under_review')";
  } else if (status === "closed") {
    where = "d.status IN ('won','lost','warning_closed','charge_refunded')";
  }

  const { rows } = await dbQuery<DisputeRow>(
    `SELECT d.id::text, d.dispute_id, d.charge_id, d.payment_intent_id,
            d.order_id::text, d.amount_cents, d.currency, d.reason, d.status,
            d.evidence_due_by::text, d.evidence_submitted,
            d.evidence_submitted_at::text, d.evidence_data,
            d.created_at::text, d.updated_at::text,
            u.email AS buyer_email,
            co.total_cents AS order_total_cents
       FROM stripe_disputes d
       LEFT JOIN commerce_orders co ON co.id = d.order_id
       LEFT JOIN users u ON u.id = co.buyer_user_id
      WHERE ${where}
      ORDER BY
        CASE WHEN d.status IN ('needs_response','warning_needs_response') THEN 0 ELSE 1 END,
        d.evidence_due_by NULLS LAST,
        d.created_at DESC
      LIMIT 200`,
    args,
  );

  const enriched = rows.map((d) => ({
    ...d,
    win_score: scoreDispute({
      reason: d.reason,
      evidence: d.evidence_data,
      hasOrderLink: Boolean(d.order_id),
    }),
  }));

  return NextResponse.json({ success: true, count: enriched.length, disputes: enriched });
}

export async function POST(req: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  let body: { disputeId?: unknown; evidence?: unknown; submit?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body trebuie JSON" }, { status: 400 });
  }

  const disputeId = typeof body?.disputeId === "string" ? body.disputeId.trim() : "";
  const evidence = body?.evidence && typeof body.evidence === "object" ? (body.evidence as Record<string, unknown>) : {};
  const submit = body?.submit === true;

  if (!/^dp_[A-Za-z0-9]+$/.test(disputeId)) {
    return NextResponse.json({ error: "disputeId invalid" }, { status: 400 });
  }

  const { rows: existing } = await dbQuery<{
    id: string;
    status: string;
    evidence_submitted: boolean;
  }>(
    `SELECT id::text, status, evidence_submitted
       FROM stripe_disputes WHERE dispute_id = $1 LIMIT 1`,
    [disputeId],
  );
  if (existing.length === 0) {
    return NextResponse.json({ error: "Dispute inexistent local" }, { status: 404 });
  }
  if (existing[0].evidence_submitted && submit) {
    return NextResponse.json({ error: "Evidence deja submitted" }, { status: 409 });
  }

  if (submit) {
    try {
      const stripe = getStripe();
      const updated = await stripe.disputes.update(disputeId, {
        evidence,
        submit: true,
      });

      await dbQuery(
        `UPDATE stripe_disputes
            SET evidence_submitted = true,
                evidence_submitted_at = now(),
                evidence_data = $2::jsonb,
                status = $3,
                updated_at = now()
          WHERE dispute_id = $1`,
        [disputeId, JSON.stringify(evidence), updated.status],
      );

      logger.info({ disputeId, newStatus: updated.status }, "[Admin] Dispute evidence submitted");
      return NextResponse.json({ success: true, status: updated.status, submitted: true });
    } catch (err) {
      logger.error({ err, disputeId }, "[Admin] Stripe dispute.update failed");
      const message = err instanceof Error ? err.message : "Stripe API error";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Save as draft only.
  await dbQuery(
    `UPDATE stripe_disputes
        SET evidence_data = $2::jsonb,
            updated_at = now()
      WHERE dispute_id = $1`,
    [disputeId, JSON.stringify(evidence)],
  );

  return NextResponse.json({ success: true, submitted: false, draftSaved: true });
}
