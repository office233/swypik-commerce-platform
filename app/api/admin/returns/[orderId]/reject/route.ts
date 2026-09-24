/**
 * Admin Returns — Reject
 * POST /api/admin/returns/[orderId]/reject
 * Body JSON: { reason: string } sau form-data
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { logAdminAction } from "@/lib/security/admin-audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_REASON_CODE = "rejected_by_admin";

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
    let reason = "";
    try {
      if (ct.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        const fd = await req.formData();
        const v = fd.get("reason");
        reason = typeof v === "string" ? v.trim() : "";
      }
    } catch {
      /* ignore malformed body, fall back to the default reason code below */
    }

    if (reason.length < 3) {
      reason = DEFAULT_REASON_CODE;
    }

    const { rows } = await dbQuery<{ id: string }>(
      `SELECT id FROM commerce_orders WHERE id = $1::uuid LIMIT 1`,
      [orderId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    }

    const event = {
      type: "rejected",
      at: new Date().toISOString(),
      actor: "admin",
      reason,
    };

    await dbQuery(
      `UPDATE commerce_orders
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'return_status', 'rejected',
                'return_rejected_at', NOW()::text,
                'return_rejection_reason', $2::text,
                'return_history', COALESCE(metadata->'return_history', '[]'::jsonb) || $3::jsonb
              )
        WHERE id = $1::uuid`,
      [orderId, reason, JSON.stringify([event])]
    );

    await dbQuery(
      `INSERT INTO moderation_actions (target_user_id, action_type, reason, metadata)
       SELECT co.buyer_user_id, 'warn', 'return_rejected', jsonb_build_object('order_id', $1::text, 'rejection_reason', $2::text)
         FROM commerce_orders co
        WHERE co.id = $1::uuid AND co.buyer_user_id IS NOT NULL`,
      [orderId, reason]
    );

    await logAdminAction({
      action: "return.reject",
      targetType: "commerce_order",
      targetId: orderId,
      details: { reason },
      req,
    });

    if (isFormRequest) {
      return NextResponse.redirect(new URL("/admin/returns", req.url), 303);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, orderId }, "[admin/returns/reject] failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
