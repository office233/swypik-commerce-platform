import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { deriveOrderStatus } from "@/lib/commerce/order-status";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { sendCustomerShippingAlert } from "@/lib/email/service";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { rows } = await dbQuery(
      `SELECT
         co.id as order_id,
         co.status as order_status,
         co.metadata as order_meta,
         co.created_at,
         SUM(coi.quantity * coi.unit_amount_cents) as total_cents,
         json_agg(
           json_build_object(
             'item_id', coi.id,
             'title', coi.title,
             'quantity', coi.quantity,
             'unit_amount_cents', coi.unit_amount_cents,
             'metadata', coi.metadata,
             'source_status', coi.source_status
           )
           ORDER BY coi.created_at
         ) as items
       FROM commerce_orders co
       JOIN commerce_order_items coi ON co.id = coi.order_id
       WHERE coi.metadata->>'seller_id' = $1
       GROUP BY co.id, co.status, co.metadata, co.created_at
       ORDER BY co.created_at DESC`,
      [sellerId]
    );

    const orders = rows.map((row: any) => {
      const items = row.items || [];
      const allFulfilled = items.length > 0 && items.every((i: any) => i.source_status === "fulfilled");
      const itemTracking = items.find((i: any) => i.metadata?.tracking_number)?.metadata?.tracking_number;
      const itemTrackingUrl = items.find((i: any) => i.metadata?.tracking_url)?.metadata?.tracking_url;

      let status: string;
      if (row.order_status === "return_requested" || row.order_status === "refunded") {
        status = row.order_status;
      } else {
        status = allFulfilled ? "fulfilled" : "pending_seller_action";
      }

      const statusInfo = deriveOrderStatus({
        status: row.order_status,
        fulfillmentStatus: status,
        metadata: row.order_meta,
        trackingNumber: itemTracking || row.order_meta?.tracking_number,
      });

      return {
        ...row,
        status,
        status_label: statusInfo.label,
        order_metadata: {
          tracking_number: itemTracking || row.order_meta?.tracking_number || row.order_meta?.latest_tracking_number || null,
          tracking_url: itemTrackingUrl || row.order_meta?.tracking_url || row.order_meta?.latest_tracking_url || null,
          return_reason: row.order_meta?.return_reason || null,
          return_requested_at: row.order_meta?.return_requested_at || null,
        },
      };
    });

    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller Orders API] GET Error:");
    return NextResponse.json({ success: false, error: "Eroare la preluarea comenzilor." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { order_id, tracking_number, tracking_url } = body;
    const trackingNumber = String(tracking_number || "").trim();
    const trackingUrl = tracking_url ? String(tracking_url).trim() : `https://track24.net/?code=${encodeURIComponent(trackingNumber)}`;

    if (!order_id || !trackingNumber) {
      return NextResponse.json({ success: false, error: "order_id si tracking_number sunt obligatorii." }, { status: 400 });
    }

    if (trackingNumber.length < 3 || trackingNumber.length > 120) {
      return NextResponse.json({ success: false, error: "tracking_number invalid." }, { status: 400 });
    }

    const checkOrder = await dbQuery(
      `SELECT co.status
       FROM commerce_orders co
       JOIN commerce_order_items coi ON co.id = coi.order_id
       WHERE co.id = $1
         AND coi.metadata->>'seller_id' = $2
       LIMIT 1`,
      [order_id, sellerId]
    );

    if (checkOrder.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Comanda nu exista sau nu iti apartine." }, { status: 403 });
    }

    if (["cancelled", "refunded", "return_requested", "failed"].includes(checkOrder.rows[0].status)) {
      return NextResponse.json({ success: false, error: "Comanda nu mai poate fi expediata in statusul curent." }, { status: 409 });
    }

    const { rows } = await dbQuery(
      `UPDATE commerce_order_items
       SET source_status = 'fulfilled',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'tracking_number', $3::text,
             'tracking_url', $4::text,
             'fulfilled_at', NOW()::text
           )
       WHERE order_id = $1 AND metadata->>'seller_id' = $2
       RETURNING order_id`,
      [order_id, sellerId, trackingNumber, trackingUrl]
    );

    const supplierOrderId = `${order_id}:${sellerId}`;
    const supplierOrderRes = await dbQuery(
      `INSERT INTO supplier_orders (
         commerce_order_id, supplier, supplier_order_id, status, metadata, submitted_at
       ) VALUES ($1, 'seller', $2, 'shipped', $3::jsonb, now())
       ON CONFLICT (supplier, supplier_order_id) WHERE supplier_order_id IS NOT NULL
       DO UPDATE SET
         status = 'shipped',
         metadata = supplier_orders.metadata || EXCLUDED.metadata,
         submitted_at = COALESCE(supplier_orders.submitted_at, EXCLUDED.submitted_at),
         updated_at = now()
       RETURNING id`,
      [
        order_id,
        supplierOrderId,
        JSON.stringify({ seller_id: sellerId, tracking_number: trackingNumber, tracking_url: trackingUrl }),
      ]
    );
    const supplierOrderDbId = supplierOrderRes.rows[0]?.id || null;

    await dbQuery(
      `INSERT INTO fulfillment_shipments (
         commerce_order_id, supplier_order_id, tracking_number, tracking_url, status, shipped_at, metadata
       )
       SELECT $1, $2, $3, $4, 'in_transit', now(), $5::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM fulfillment_shipments
         WHERE commerce_order_id = $1 AND tracking_number = $3
       )`,
      [
        order_id,
        supplierOrderDbId,
        trackingNumber,
        trackingUrl,
        JSON.stringify({ source: "seller", seller_id: sellerId }),
      ]
    );

    const statusRes = await dbQuery(
      `SELECT
         COUNT(*) FILTER (WHERE source_status NOT IN ('fulfilled', 'cancelled')) AS remaining_items,
         COUNT(*) AS total_items
       FROM commerce_order_items
       WHERE order_id = $1`,
      [order_id]
    );
    const remainingItems = Number(statusRes.rows[0]?.remaining_items || 0);
    const orderMetadataPatch: Record<string, any> = {
      fulfillment_status: remainingItems === 0 ? "shipped" : "partially_shipped",
      latest_tracking_number: trackingNumber,
      latest_tracking_url: trackingUrl,
    };

    if (remainingItems === 0) {
      orderMetadataPatch.tracking_number = trackingNumber;
      orderMetadataPatch.tracking_url = trackingUrl;
    }

    const trackingEntry = {
      seller_id: sellerId,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      added_at: new Date().toISOString(),
    };

    await dbQuery(
      `UPDATE commerce_orders
       SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             '{tracking_numbers}',
             COALESCE(metadata->'tracking_numbers', '[]'::jsonb) || jsonb_build_array($3::jsonb),
             true
           ),
           status = CASE WHEN $4::int = 0 THEN 'fulfilled' ELSE status END,
           fulfilled_at = CASE WHEN $4::int = 0 THEN COALESCE(fulfilled_at, now()) ELSE fulfilled_at END
       WHERE id = $1`,
      [order_id, JSON.stringify(orderMetadataPatch), JSON.stringify(trackingEntry), remainingItems]
    );

    try {
      const orderRes = await dbQuery(
        `SELECT metadata->>'customer_email' as customer_email FROM commerce_orders WHERE id = $1 LIMIT 1`,
        [order_id]
      );
      if (orderRes.rows.length > 0 && orderRes.rows[0].customer_email) {
        await sendCustomerShippingAlert(orderRes.rows[0].customer_email, trackingNumber);
      }
    } catch (emailErr) {
      logger.error({ err: emailErr }, "[Seller Orders API] Failed to send tracking email:");
    }

    return NextResponse.json({ success: true, order: rows[0], trackingNumber, trackingUrl });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller Orders API] POST Error:");
    return NextResponse.json({ success: false, error: "Eroare la actualizarea comenzii." }, { status: 500 });
  }
}
