/**
 * Admin: AE manual cancellation tracker.
 *
 * Context: AliExpress Open Platform does not expose a cancel API in our scope,
 * so when a refund happens after we've already placed an order at AE, the
 * Stripe webhook flags the item with metadata.ae_cancel_required=true and the
 * admin must contact AE (or the seller's account) out of band, then come here
 * to mark the cancellation as completed.
 *
 *   GET  /api/admin/ae-cancel              -> list items needing manual cancel
 *   POST /api/admin/ae-cancel  body:{itemId,note?,status?}
 *        status: "cancelled" (default) | "uncancelable"
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type PendingRow = {
  item_id: string;
  order_id: string;
  title: string;
  quantity: number;
  ae_order_id: string | null;
  source_status: string;
  refunded_at: string | null;
  refund_amount_cents: number | null;
  flagged_at: string | null;
};

export async function GET() {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const { rows } = await dbQuery<PendingRow>(
    `SELECT coi.id::text                          AS item_id,
            coi.order_id::text                    AS order_id,
            coi.title,
            coi.quantity,
            coi.metadata->>'ae_order_id'          AS ae_order_id,
            coi.source_status,
            coi.metadata->>'refunded_at'          AS refunded_at,
            NULLIF(coi.metadata->>'refund_amount_cents','')::int AS refund_amount_cents,
            coi.metadata->>'refunded_at'          AS flagged_at
       FROM commerce_order_items coi
      WHERE (coi.metadata->>'ae_cancel_required')::boolean = true
        AND COALESCE(coi.metadata->>'ae_cancel_resolved_at','') = ''
      ORDER BY coi.updated_at DESC
      LIMIT 200`,
  );

  return NextResponse.json({ success: true, count: rows.length, items: rows });
}

export async function POST(req: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body trebuie JSON valid" }, { status: 400 });
  }

  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  const status = body?.status === "uncancelable" ? "uncancelable" : "cancelled";

  if (!/^[0-9a-f-]{36}$/i.test(itemId)) {
    return NextResponse.json({ error: "itemId invalid (UUID required)" }, { status: 400 });
  }

  const { rows: existing } = await dbQuery<{
    id: string;
    order_id: string;
    ae_order_id: string | null;
    ae_cancel_required: boolean;
    ae_cancel_resolved_at: string | null;
  }>(
    `SELECT id::text,
            order_id::text,
            metadata->>'ae_order_id'                                  AS ae_order_id,
            COALESCE((metadata->>'ae_cancel_required')::boolean,false) AS ae_cancel_required,
            metadata->>'ae_cancel_resolved_at'                        AS ae_cancel_resolved_at
       FROM commerce_order_items
      WHERE id = $1::uuid
      LIMIT 1`,
    [itemId],
  );

  if (existing.length === 0) {
    return NextResponse.json({ error: "Item inexistent" }, { status: 404 });
  }
  const item = existing[0];
  if (!item.ae_cancel_required) {
    return NextResponse.json({ error: "Itemul nu este marcat ae_cancel_required" }, { status: 409 });
  }
  if (item.ae_cancel_resolved_at) {
    return NextResponse.json({ error: "Deja rezolvat", resolvedAt: item.ae_cancel_resolved_at }, { status: 409 });
  }

  const event = {
    type: "ae_cancel_resolved",
    status,
    at: new Date().toISOString(),
    actor: "admin",
    note: note || null,
  };

  await dbQuery(
    `UPDATE commerce_order_items
        SET source_status = 'cancelled',
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object(
                   'ae_cancel_resolved_at', NOW()::text,
                   'ae_cancel_status', $2::text,
                   'ae_cancel_note', $3::text,
                   'ae_cancel_history',
                     COALESCE(metadata->'ae_cancel_history', '[]'::jsonb) || $4::jsonb
                 )
      WHERE id = $1::uuid`,
    [itemId, status, note, JSON.stringify([event])],
  );

  logger.info(
    { itemId, orderId: item.order_id, aeOrderId: item.ae_order_id, status, note },
    "[Admin] AE cancel resolved",
  );

  return NextResponse.json({ success: true, itemId, status });
}
