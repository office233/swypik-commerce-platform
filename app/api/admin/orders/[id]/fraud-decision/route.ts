/**
 * Admin: manual decision on a flagged order's fraud status.
 *
 *   POST /api/admin/orders/<id>/fraud-decision
 *   body: { action: "approve" | "block", reason?: string }
 *
 *   approve: clears fraud_block (cron can process), keeps audit trail.
 *   block:   force fraud_block=true (e.g. admin spots issue manually).
 *
 * Both actions are persisted in metadata.fraud_decisions[] for audit
 * and notified to ops (cooldown 1 min — admin actions are intentional, low volume).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hasAdminSession, isAdminRequest } from "@/lib/security/admin-auth";
import { notifyOps } from "@/lib/ops/alerts";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ok = (await hasAdminSession()) || isAdminRequest(req);
  if (!ok) return NextResponse.json({ error: "Neautorizat" }, { status: 403 });

  const { id: orderId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body?.action || "").toLowerCase();
  const reason = String(body?.reason || "").slice(0, 500).trim();
  if (action !== "approve" && action !== "block") {
    return NextResponse.json({ error: "action must be approve|block" }, { status: 400 });
  }

  const { rows } = await dbQuery<{ id: string; status: string; metadata: any; total_cents: number; currency: string }>(
    `SELECT id::text, status, metadata, total_cents, currency
       FROM commerce_orders WHERE id = $1 LIMIT 1`,
    [orderId],
  );
  const o = rows[0];
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const md = o.metadata || {};
  const prevBlock = md.fraud_block === true;
  const prevReview = md.fraud_review === true;
  const decisions = Array.isArray(md.fraud_decisions) ? md.fraud_decisions : [];

  const decision = {
    action,
    reason: reason || null,
    at: new Date().toISOString(),
    prev_block: prevBlock,
    prev_review: prevReview,
    score: typeof md.fraud_score === "number" ? md.fraud_score : null,
  };

  const patch: Record<string, unknown> = {
    fraud_decisions: [...decisions, decision],
    fraud_last_decision: decision,
  };
  if (action === "approve") {
    patch.fraud_block = false;
    patch.fraud_review = false;
    patch.fraud_approved_at = decision.at;
  } else {
    patch.fraud_block = true;
    patch.fraud_review = true;
    patch.fraud_blocked_manually_at = decision.at;
  }

  await dbQuery(
    `UPDATE commerce_orders SET metadata = metadata || $1::jsonb WHERE id = $2`,
    [JSON.stringify(patch), orderId],
  );

  logger.info({ orderId, action, reason }, `[fraud-decision] admin ${action} order ${orderId}`);

  await notifyOps({
    key: `fraud_decision:${orderId}:${action}`,
    severity: action === "block" ? "warning" : "info",
    title: `Admin ${action.toUpperCase()} order ${orderId.slice(0, 8)} — ${(o.total_cents / 100).toFixed(2)} ${o.currency.toUpperCase()}`,
    detail: reason ? `Motiv: ${reason}` : "(fără motiv specificat)",
    link: `https://swypik.com/admin/risk?status=${o.status}`,
    payload: { orderId, action, score: decision.score },
    cooldownMin: 1,
  }).catch((e) => logger.warn({ err: e }, "[fraud-decision] notify failed"));

  return NextResponse.json({ success: true, action, orderId });
}
