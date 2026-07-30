/**
 * Admin Orders API
 * GET  /api/admin/orders        — list all orders with filters
 * PATCH /api/admin/orders       — update order status/tracking
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { requireAuth } from "@/lib/auth/getAuthUser";

import { logger } from "@/lib/logger";
import { AdminOrderPatchSchema, parseBody } from "@/lib/validation/schemas";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const limit = Math.min(100, Number(url.searchParams.get("limit")) || 50);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  let whereClause = "";
  const params: string[] = [];

  if (status) {
    params.push(status);
    whereClause = `WHERE o.status = $${params.length}`;
  }

  const { rows: orders } = await dbQuery(
    `SELECT
       o.id,
       o.status,
       (o.total_cents::numeric / 100) AS total_ron,
       o.metadata,
       o.created_at,
       o.fulfilled_at,
       (SELECT count(*) FROM commerce_order_items WHERE order_id = o.id) AS item_count
     FROM commerce_orders o
     ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  const { rows: countRows } = await dbQuery(
    `SELECT count(*) FROM commerce_orders o ${whereClause}`,
    params
  );

  interface AdminOrderRow {
    id: string;
    status: string;
    total_ron: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
    fulfilled_at: string | null;
    item_count: string;
  }
  const formattedOrders = (orders as AdminOrderRow[]).map((o) => {
    const meta = o.metadata || {};
    return {
      id: o.id,
      status: o.status,
      fulfillmentStatus: meta.fulfillment_status || "pending",
      totalRon: Number(o.total_ron),
      itemCount: Number(o.item_count),
      customerEmail: meta.customer_email || meta.email || null,
      trackingNumber: meta.tracking_number || null,
      source: meta.source || "unknown",
      createdAt: o.created_at,
      fulfilledAt: o.fulfilled_at,
    };
  });

  return NextResponse.json({
    orders: formattedOrders,
    total: Number(countRows[0]?.count || 0),
    limit,
    offset,
  });
}

export async function PATCH(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(AdminOrderPatchSchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { orderId, status, trackingNumber, trackingUrl, fulfillmentStatus, notes } = parsed.data;

    const updates: string[] = [];
    const params: string[] = [orderId];
    const metaUpdates: Record<string, unknown> = {};

    if (status) {
      params.push(status);
      updates.push(`status = $${params.length}`);
    }

    if (fulfillmentStatus) {
      metaUpdates.fulfillment_status = fulfillmentStatus;
      if (fulfillmentStatus === "fulfilled" || fulfillmentStatus === "shipped") {
        updates.push(`fulfilled_at = NOW()`);
      }
    }

    if (trackingNumber) {
      metaUpdates.tracking_number = trackingNumber;
      metaUpdates.latest_tracking_number = trackingNumber;
    }

    if (trackingUrl) {
      metaUpdates.tracking_url = trackingUrl;
      metaUpdates.latest_tracking_url = trackingUrl;
    }

    if (notes) {
      metaUpdates.admin_notes = notes;
    }

    metaUpdates.updated_at = new Date().toISOString();
    metaUpdates.updated_by = "admin";

    params.push(JSON.stringify(metaUpdates));
    updates.push(`metadata = metadata || $${params.length}::jsonb`);

    const sql = `UPDATE commerce_orders SET ${updates.join(", ")} WHERE id = $1 RETURNING id, status, metadata`;
    const { rows } = await dbQuery(sql, params);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, order: rows[0] });
  } catch (error: unknown) {
    logger.error({ err: error }, "[Admin Orders PATCH]");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
