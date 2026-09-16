import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { sendCustomerShippingAlert } from "@/lib/email/service";
import { logger } from "@/lib/logger";
import { SellerGenerateAwbSchema, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

function generateAwbCode(courier: string, manualNumber?: string): { trackingNumber: string; carrierName: string; trackingUrl: string } {
  if (manualNumber && manualNumber.trim().length > 0) {
    const clean = manualNumber.trim();
    let carrierName = "Livrare Standard";
    let trackingUrl = `https://swypik.com/tracking?awb=${encodeURIComponent(clean)}`;

    if (courier === "sameday_easybox") {
      carrierName = "Sameday Easybox";
      trackingUrl = `https://sameday.ro/#awb=${encodeURIComponent(clean)}`;
    } else if (courier === "sameday") {
      carrierName = "Sameday Curier";
      trackingUrl = `https://sameday.ro/#awb=${encodeURIComponent(clean)}`;
    } else if (courier === "fancourier") {
      carrierName = "Fan Courier";
      trackingUrl = `https://www.fancourier.ro/awb-tracking/?awb=${encodeURIComponent(clean)}`;
    }

    return { trackingNumber: clean, carrierName, trackingUrl };
  }

  if (courier === "sameday_easybox") {
    const rand = Math.floor(10000000 + Math.random() * 90000000);
    const trackingNumber = `1SMEB${rand}`;
    return {
      trackingNumber,
      carrierName: "Sameday Easybox",
      trackingUrl: `https://sameday.ro/#awb=${encodeURIComponent(trackingNumber)}`,
    };
  }

  if (courier === "sameday") {
    const rand = Math.floor(100000000 + Math.random() * 900000000);
    const trackingNumber = `1SM${rand}`;
    return {
      trackingNumber,
      carrierName: "Sameday Curier",
      trackingUrl: `https://sameday.ro/#awb=${encodeURIComponent(trackingNumber)}`,
    };
  }

  if (courier === "fancourier") {
    const rand = Math.floor(100000000 + Math.random() * 900000000);
    const trackingNumber = `247${rand}`;
    return {
      trackingNumber,
      carrierName: "Fan Courier",
      trackingUrl: `https://www.fancourier.ro/awb-tracking/?awb=${encodeURIComponent(trackingNumber)}`,
    };
  }

  // Standard Express
  const rand = Math.floor(100000000 + Math.random() * 900000000);
  const trackingNumber = `SWP${rand}`;
  return {
    trackingNumber,
    carrierName: "Livrare Standard",
    trackingUrl: `https://swypik.com/tracking?awb=${encodeURIComponent(trackingNumber)}`,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const { id: orderId } = await params;

    // Check order and fetch items
    const { rows: orderRows } = await dbQuery<{
      order_id: string;
      order_status: string;
      order_meta: any;
      created_at: string;
      fulfilled_at: string | null;
      total_cents: number;
      items: any[];
    }>(
      `SELECT
         co.id as order_id,
         co.status as order_status,
         co.metadata as order_meta,
         co.created_at,
         co.fulfilled_at,
         COALESCE(SUM(coi.quantity * coi.unit_amount_cents) FILTER (WHERE coi.metadata->>'seller_id' = $2), 0) as total_cents,
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
         ) FILTER (WHERE coi.metadata->>'seller_id' = $2) as items
       FROM commerce_orders co
       JOIN commerce_order_items coi ON co.id = coi.order_id
       WHERE co.id = $1 AND coi.metadata->>'seller_id' = $2
       GROUP BY co.id, co.status, co.metadata, co.created_at, co.fulfilled_at`,
      [orderId, sellerId]
    );

    if (orderRows.length === 0) {
      return NextResponse.json({ success: false, error: "Comanda nu a fost găsită." }, { status: 404 });
    }

    const order = orderRows[0];
    const meta = order.order_meta || {};
    const items = order.items || [];
    const awbDetails = meta.awb_details || null;

    // Get seller profile for sender details
    const { rows: sellerRows } = await dbQuery<{
      name: string | null;
      email: string;
      phone: string | null;
      cui: string | null;
      business_details: any;
    }>(
      `SELECT name, email, phone, cui, business_details FROM sellers WHERE id = $1 LIMIT 1`,
      [sellerId]
    );
    const seller = sellerRows[0] || null;

    const trackingNumber =
      awbDetails?.awb_number ||
      meta.tracking_number ||
      meta.latest_tracking_number ||
      items.find((i: any) => i.metadata?.tracking_number)?.metadata?.tracking_number ||
      null;

    const carrierName =
      awbDetails?.carrier ||
      meta.tracking_carrier ||
      meta.shipping_method ||
      meta.courier ||
      "Livrare Standard";

    const senderData = {
      name: seller?.name || "Comerciant Swypik",
      cui: seller?.cui || "RO12345678",
      phone: seller?.phone || "0700000000",
      email: seller?.email || "comerciant@swypik.ro",
      address: seller?.business_details?.address || seller?.business_details?.street || "Depozit Central Swypik",
      city: seller?.business_details?.city || "București",
      county: seller?.business_details?.county || seller?.business_details?.state || "București",
    };

    const recipientData = {
      name: meta.shipping_address?.name || meta.customer_name || "Client Swypik",
      phone: meta.customer_phone || meta.shipping_address?.phone || "-",
      email: meta.customer_email || "-",
      line1: meta.shipping_address?.line1 || "Adresă livrare",
      line2: meta.shipping_address?.line2 || "",
      city: meta.shipping_address?.city || "",
      county: meta.shipping_address?.state || "",
      postalCode: meta.shipping_address?.postal_code || "",
      country: meta.shipping_address?.country || "RO",
      lockerName: awbDetails?.locker_name || meta.easybox_locker || null,
    };

    return NextResponse.json({
      success: true,
      order: {
        id: order.order_id,
        orderNumber: `SWY-${order.order_id.slice(0, 8).toUpperCase()}`,
        status: order.order_status,
        createdAt: order.created_at,
        fulfilledAt: order.fulfilled_at,
        totalRon: (order.total_cents / 100).toFixed(2),
        items: items.map((i: any) => ({
          id: i.item_id,
          title: i.title,
          quantity: i.quantity,
          unitPriceRon: (i.unit_amount_cents / 100).toFixed(2),
          totalPriceRon: ((i.quantity * i.unit_amount_cents) / 100).toFixed(2),
        })),
      },
      awb: {
        trackingNumber,
        carrierName,
        courierCode: awbDetails?.courier_code || "standard",
        trackingUrl:
          awbDetails?.tracking_url ||
          meta.tracking_url ||
          meta.latest_tracking_url ||
          null,
        parcelsCount: awbDetails?.parcels_count || 1,
        weightKg: awbDetails?.weight_kg || 1.0,
        notes: awbDetails?.notes || "",
        generatedAt: awbDetails?.generated_at || order.fulfilled_at || order.created_at,
      },
      sender: senderData,
      recipient: recipientData,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller AWB API] GET Error:");
    return NextResponse.json({ success: false, error: "Eroare la încărcarea datelor AWB." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const rl = await rateLimit("sellerAwb", sellerId);
    if (!rl.success) {
      return NextResponse.json({ success: false, error: "Prea multe solicitări. Încearcă din nou în curând." }, { status: 429 });
    }

    const { id: orderId } = await params;
    const rawBody = await req.json().catch(() => ({}));
    const parsed = parseBody(SellerGenerateAwbSchema, rawBody);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const { courier, parcels_count, weight_kg, manual_tracking_number, notes, locker_name } = parsed.data;

    // Check that order exists and seller owns items in it
    const checkOrder = await dbQuery<{ status: string; metadata: any }>(
      `SELECT co.status, co.metadata
       FROM commerce_orders co
       JOIN commerce_order_items coi ON co.id = coi.order_id
       WHERE co.id = $1 AND coi.metadata->>'seller_id' = $2
       LIMIT 1`,
      [orderId, sellerId]
    );

    if (checkOrder.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Comanda nu există sau nu îți aparține." }, { status: 403 });
    }

    const currentStatus = checkOrder.rows[0].status;
    if (["cancelled", "refunded", "failed"].includes(currentStatus)) {
      return NextResponse.json(
        { success: false, error: "Comanda se află într-un status final și nu mai poate fi expediată." },
        { status: 409 }
      );
    }

    // Generate tracking code and carrier URLs
    const { trackingNumber, carrierName, trackingUrl } = generateAwbCode(courier, manual_tracking_number);

    // 1. Update items belonging to this seller
    await dbQuery(
      `UPDATE commerce_order_items
       SET source_status = 'fulfilled',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'tracking_number', $3::text,
             'tracking_url', $4::text,
             'carrier', $5::text,
             'fulfilled_at', NOW()::text
           )
       WHERE order_id = $1 AND metadata->>'seller_id' = $2`,
      [orderId, sellerId, trackingNumber, trackingUrl, carrierName]
    );

    // 2. Insert/update supplier order
    const supplierOrderId = `${orderId}:${sellerId}`;
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
        orderId,
        supplierOrderId,
        JSON.stringify({
          seller_id: sellerId,
          tracking_number: trackingNumber,
          tracking_url: trackingUrl,
          carrier: carrierName,
        }),
      ]
    );
    const supplierOrderDbId = supplierOrderRes.rows[0]?.id || null;

    // 3. Record fulfillment shipment
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
        orderId,
        supplierOrderDbId,
        trackingNumber,
        trackingUrl,
        JSON.stringify({ source: "seller", seller_id: sellerId, carrier: carrierName }),
      ]
    );

    // 4. Check remaining items across all sellers
    const statusRes = await dbQuery(
      `SELECT
         COUNT(*) FILTER (WHERE source_status NOT IN ('fulfilled', 'cancelled')) AS remaining_items,
         COUNT(*) AS total_items
       FROM commerce_order_items
       WHERE order_id = $1`,
      [orderId]
    );
    const remainingItems = Number(statusRes.rows[0]?.remaining_items || 0);

    const awbDetailsObj = {
      awb_number: trackingNumber,
      carrier: carrierName,
      courier_code: courier,
      parcels_count,
      weight_kg,
      notes: notes || null,
      locker_name: locker_name || null,
      generated_at: new Date().toISOString(),
    };

    const orderMetadataPatch: Record<string, any> = {
      fulfillment_status: remainingItems === 0 ? "shipped" : "partially_shipped",
      latest_tracking_number: trackingNumber,
      latest_tracking_url: trackingUrl,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      tracking_carrier: carrierName,
      shipping_method: carrierName,
      awb_details: awbDetailsObj,
    };

    if (locker_name) {
      orderMetadataPatch.easybox_locker = locker_name;
    }

    const trackingEntry = {
      seller_id: sellerId,
      carrier: carrierName,
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
      [orderId, JSON.stringify(orderMetadataPatch), JSON.stringify(trackingEntry), remainingItems]
    );

    // 5. Send tracking alert email to buyer if available
    try {
      const customerEmail = checkOrder.rows[0].metadata?.customer_email;
      if (customerEmail) {
        await sendCustomerShippingAlert(customerEmail, trackingNumber);
      }
    } catch (emailErr) {
      logger.error({ err: emailErr }, "[Seller AWB API] Nu s-a putut trimite emailul de tracking:");
    }

    return NextResponse.json({
      success: true,
      awb: {
        awbNumber: trackingNumber,
        carrier: carrierName,
        courierCode: courier,
        trackingUrl,
        parcelsCount: parcels_count,
        weightKg: weight_kg,
        generatedAt: awbDetailsObj.generated_at,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Seller AWB API] POST Error:");
    return NextResponse.json({ success: false, error: "Eroare la generarea AWB-ului." }, { status: 500 });
  }
}
