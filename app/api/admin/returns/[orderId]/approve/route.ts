/**
 * Admin Returns — Approve
 * POST /api/admin/returns/[orderId]/approve
 * Body JSON: { refundAmountCents?: number } sau form-data (HTML form fallback)
 * Marchează cererea de retur ca aprobată. NU lansează Stripe refund automat —
 * seller / webhook se ocupă; admin doar deblochează workflow-ul.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { logAdminAction } from "@/lib/security/admin-audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const { orderId } = await params;
  const ct = req.headers.get("content-type") || "";
  const isFormRequest = ct.includes("form") || (req.headers.get("accept")?.includes("text/html") ?? false);

  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: "invalid_order_id" }, { status: 400 });
  }

  try {
    let requestedRefundCents: number | null = null;
    try {
      if (ct.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        if (typeof body?.refundAmountCents === "number") {
          requestedRefundCents = body.refundAmountCents;
        }
      } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        const fd = await req.formData();
        const v = fd.get("refundAmountCents");
        if (typeof v === "string" && v.trim()) {
          const n = Number(v);
          if (Number.isFinite(n)) requestedRefundCents = n;
        }
      }
    } catch {
      /* ignore malformed body, fall back to full-amount refund below */
    }

    const { rows } = await dbQuery<{ id: string; status: string; total_cents: number }>(
      `SELECT id, status, total_cents FROM commerce_orders WHERE id = $1::uuid LIMIT 1`,
      [orderId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    }
    const order = rows[0];

    // Validate the requested refund amount server-side: never allow refunding
    // more than the order actually cost, and never a negative amount.
    let refundAmountCents: number;
    if (requestedRefundCents == null) {
      refundAmountCents = order.total_cents;
    } else if (!Number.isFinite(requestedRefundCents) || requestedRefundCents < 0) {
      return NextResponse.json({ error: "invalid_refund_amount" }, { status: 400 });
    } else if (requestedRefundCents > order.total_cents) {
      return NextResponse.json({ error: "refund_exceeds_order_total" }, { status: 400 });
    } else {
      refundAmountCents = Math.round(requestedRefundCents);
    }

    const event = {
      type: "approved",
      at: new Date().toISOString(),
      actor: "admin",
      refundAmountCents,
    };

    await dbQuery(
      `UPDATE commerce_orders
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'return_status', 'approved',
                'return_approved_at', NOW()::text,
                'return_approved_by', 'admin',
                'return_refund_amount_cents', $2::int,
                'return_history', COALESCE(metadata->'return_history', '[]'::jsonb) || $3::jsonb
              )
        WHERE id = $1::uuid`,
      [orderId, refundAmountCents, JSON.stringify([event])]
    );

    await dbQuery(
      `INSERT INTO moderation_actions (target_user_id, action_type, reason, metadata)
       SELECT co.buyer_user_id, 'warn', 'return_approved', jsonb_build_object('order_id', $1::text, 'refund_amount_cents', $2::int)
         FROM commerce_orders co
        WHERE co.id = $1::uuid AND co.buyer_user_id IS NOT NULL`,
      [orderId, refundAmountCents]
    );

    await logAdminAction({
      action: "return.approve",
      targetType: "commerce_order",
      targetId: orderId,
      details: { refundAmountCents },
      req,
    });

    if (isFormRequest) {
      return NextResponse.redirect(new URL("/admin/returns", req.url), 303);
    }
    return NextResponse.json({ success: true, refundAmountCents });
  } catch (err) {
    logger.error({ err, orderId }, "[admin/returns/approve] failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
