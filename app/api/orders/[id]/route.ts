/**
 * Order Lookup API
 * GET /api/orders/[id]
 * Public/customer tracking uses order_lookup_token as the path segment.
 * Admin requests may still load by internal order UUID via the admin cookie.
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { deriveOrderStatus } from "@/lib/commerce/order-status";
import { isAdminRequest } from "@/lib/security/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const isAdmin = await isAdminRequest(req);
    const looksLikeUuid = UUID_RE.test(params.id);
    const lookupValue = token || params.id;

    const { rows } = await dbQuery(
      `SELECT
         id,
         status,
         (total_cents::numeric / 100) AS total_ron,
         metadata,
         created_at,
         fulfilled_at
       FROM commerce_orders
       WHERE
         metadata->>'order_lookup_token' = $1
         OR ($2::boolean AND id = $3::uuid)
       LIMIT 1`,
      [lookupValue, isAdmin && looksLikeUuid, looksLikeUuid ? params.id : null]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Comanda nu a fost găsită." }, { status: 404 });
    }

    const order = rows[0];
    const meta = order.metadata || {};
    if (!isAdmin && lookupValue !== meta.order_lookup_token) {
      return NextResponse.json({ error: "Link de urmărire invalid sau expirat." }, { status: 403 });
    }

    const { rows: items } = await dbQuery(
      `SELECT title, quantity, (unit_amount_cents::numeric / 100) AS unit_price
       FROM commerce_order_items WHERE order_id = $1`,
      [order.id]
    );

    const trackingNumbers = Array.isArray(meta.tracking_numbers) ? meta.tracking_numbers : [];
    const latestTracking = trackingNumbers.length > 0 ? trackingNumbers[trackingNumbers.length - 1] : null;
    const trackingNumber = meta.tracking_number || meta.latest_tracking_number || latestTracking?.tracking_number || null;
    const trackingUrl = meta.tracking_url || meta.latest_tracking_url || latestTracking?.tracking_url || null;
    const fulfillmentStatus = meta.fulfillment_status || "pending";
    const derivedStatus = deriveOrderStatus({
      status: order.status,
      fulfillmentStatus,
      metadata: meta,
      trackingNumber,
    });

    return NextResponse.json({
      id: order.id,
      status: order.status,
      paymentStatus: order.status,
      fulfillmentStatus,
      displayStatus: derivedStatus.key,
      statusLabel: derivedStatus.label,
      statusDetail: derivedStatus.description,
      statusStep: derivedStatus.step,
      isTerminal: derivedStatus.isTerminal,
      isReturnable: derivedStatus.isReturnable,
      totalRon: Number(order.total_ron),
      items,
      shipping: meta.shipping_address || null,
      trackingNumber,
      trackingUrl,
      trackingNumbers,
      returnReason: meta.return_reason || null,
      returnRequestedAt: meta.return_requested_at || null,
      createdAt: order.created_at,
      fulfilledAt: order.fulfilled_at,
    });
  } catch (error: any) {
    console.error("[Order Lookup]", error);
    return NextResponse.json({ error: "Nu am putut încărca această comandă." }, { status: 500 });
  }
}
