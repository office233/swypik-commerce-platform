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

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const { orderId } = await params;

  let refundAmountCents: number | null = null;
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.refundAmountCents === "number") {
        refundAmountCents = body.refundAmountCents;
      }
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const v = fd.get("refundAmountCents");
      if (typeof v === "string" && v.trim()) {
        const n = Number(v);
        if (Number.isFinite(n)) refundAmountCents = n;
      }
    }
  } catch {
    /* ignore */
  }

  const { rows } = await dbQuery(
    `SELECT id, status, metadata FROM commerce_orders WHERE id = $1::uuid LIMIT 1`,
    [orderId]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Comanda nu a fost găsită" }, { status: 404 });
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

  if (req.headers.get("accept")?.includes("text/html") || ct.includes("form")) {
    return NextResponse.redirect(new URL("/admin/returns", req.url), 303);
  }
  return NextResponse.json({ success: true });
}
