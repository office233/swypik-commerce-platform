/**
 * Admin: derive suggested evidence fields from the order linked to a dispute.
 * GET /api/admin/disputes/:disputeId/suggest
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hasAdminSession } from "@/lib/security/admin-auth";

export const dynamic = "force-dynamic";

type OrderRow = {
  order_id: string;
  buyer_user_id: string | null;
  buyer_email: string | null;
  buyer_username: string | null;
  total_cents: number;
  currency: string;
  metadata: Record<string, any> | null;
  placed_at: string | null;
};

type ItemRow = {
  title: string;
  quantity: number;
  metadata: Record<string, any> | null;
};

function pickShipping(meta: Record<string, any> | null): {
  formatted: string;
  carrier: string | null;
  tracking: string | null;
  shipped_at: string | null;
} {
  const out = { formatted: "", carrier: null as string | null, tracking: null as string | null, shipped_at: null as string | null };
  if (!meta) return out;
  const sa = meta.shipping_address || meta.shippingAddress;
  if (sa && typeof sa === "object") {
    const parts: string[] = [];
    if (sa.name) parts.push(String(sa.name));
    if (sa.line1) parts.push(String(sa.line1));
    if (sa.line2) parts.push(String(sa.line2));
    const cityLine = [sa.city, sa.postal_code, sa.state].filter(Boolean).join(", ");
    if (cityLine) parts.push(cityLine);
    if (sa.country) parts.push(String(sa.country));
    if (sa.phone) parts.push(`tel: ${sa.phone}`);
    out.formatted = parts.join("\n");
  }
  out.carrier = meta.shipping_carrier || meta.carrier || null;
  out.tracking = meta.tracking_number || meta.trackingNumber || null;
  out.shipped_at = meta.shipped_at || meta.shippedAt || null;
  return out;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }
  const { disputeId } = await params;
  if (!/^dp_[A-Za-z0-9]+$/.test(disputeId)) {
    return NextResponse.json({ error: "disputeId invalid" }, { status: 400 });
  }

  const { rows: dRows } = await dbQuery<{ order_id: string | null }>(
    `SELECT order_id::text FROM stripe_disputes WHERE dispute_id = $1 LIMIT 1`,
    [disputeId],
  );
  if (dRows.length === 0) {
    return NextResponse.json({ error: "Dispute inexistent" }, { status: 404 });
  }
  const orderId = dRows[0].order_id;
  if (!orderId) {
    return NextResponse.json({ success: true, suggestion: {}, reason: "no_order_linked" });
  }

  const { rows: oRows } = await dbQuery<OrderRow>(
    `SELECT co.id::text                AS order_id,
            co.buyer_user_id::text     AS buyer_user_id,
            u.email                    AS buyer_email,
            u.username                 AS buyer_username,
            co.total_cents,
            co.currency,
            co.metadata,
            co.placed_at::text         AS placed_at
       FROM commerce_orders co
       LEFT JOIN users u ON u.id = co.buyer_user_id
      WHERE co.id = $1::uuid
      LIMIT 1`,
    [orderId],
  );
  if (oRows.length === 0) {
    return NextResponse.json({ success: true, suggestion: {}, reason: "order_not_found" });
  }
  const order = oRows[0];

  const { rows: items } = await dbQuery<ItemRow>(
    `SELECT title, quantity, metadata
       FROM commerce_order_items
      WHERE order_id = $1::uuid
      ORDER BY created_at`,
    [orderId],
  );

  const ship = pickShipping(order.metadata);

  // Derive customer name preference: buyer username → shipping name → email local part
  const sa = (order.metadata as any)?.shipping_address || (order.metadata as any)?.shippingAddress;
  const customerName =
    (sa && typeof sa === "object" && sa.name) ||
    order.buyer_username ||
    (order.buyer_email ? order.buyer_email.split("@")[0] : "") ||
    "";

  const productDescription = items
    .map((i) => `${i.quantity}× ${i.title}`)
    .join("\n")
    .slice(0, 1500);

  const placedStr = order.placed_at
    ? new Date(order.placed_at).toISOString().slice(0, 10)
    : "";

  const suggestion: Record<string, string> = {};
  if (productDescription) suggestion.product_description = productDescription;
  if (customerName) suggestion.customer_name = customerName;
  if (order.buyer_email) suggestion.customer_email_address = order.buyer_email;
  if (ship.formatted) suggestion.shipping_address = ship.formatted;
  if (ship.carrier) suggestion.shipping_carrier = ship.carrier;
  if (ship.tracking) suggestion.shipping_tracking_number = ship.tracking;
  if (ship.shipped_at) {
    suggestion.shipping_date = String(ship.shipped_at).slice(0, 10);
  } else if (placedStr) {
    suggestion.shipping_date = placedStr;
  }

  return NextResponse.json({
    success: true,
    orderId,
    suggestion,
    meta: {
      itemCount: items.length,
      totalCents: order.total_cents,
      currency: order.currency,
      hasTracking: Boolean(ship.tracking),
    },
  });
}
