/**
 * Admin Orders API
 * GET  /api/admin/orders        — list all orders with filters
 * PATCH /api/admin/orders       — update order status/tracking
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { isAdminRequest } from "@/lib/security/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const limit = Math.min(100, Number(url.searchParams.get("limit")) || 50);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  let whereClause = "";
  const params: any[] = [];

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

  const formattedOrders = orders.map((o: any) => {
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
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { orderId, status, trackingNumber, trackingUrl, fulfillmentStatus, notes } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    const updates: string[] = [];
    const params: any[] = [orderId];
    const metaUpdates: Record<string, any> = {};

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
  } catch (error: any) {
    console.error("[Admin Orders PATCH]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
