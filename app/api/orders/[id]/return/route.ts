/**
 * Customer Return Request API
 * POST /api/orders/[id]/return
 *
 * Allows a customer to request a return for a delivered/fulfilled order.
 * Requires the order_lookup_token for authentication (same as tracking page).
 * Updates order status to 'return_requested' and stores the return reason in metadata.
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { canRequestReturn } from "@/lib/commerce/order-status";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";

import { logger } from "@/lib/logger";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isEnabled("returns")) return frozenResponse("returns");
  const { id } = await params;
  try {
    const body = await req.json();
    const { reason, token } = body;

    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return NextResponse.json(
        { error: "Motivul returului este obligatoriu (minim 5 caractere)." },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json(
        { error: "Token de autentificare lipsă." },
        { status: 401 }
      );
    }

    // Verify order exists and belongs to this customer (via lookup token)
    const { rows } = await dbQuery(
      `SELECT id, status, metadata
       FROM commerce_orders
       WHERE id = $1::uuid
         AND metadata->>'order_lookup_token' = $2
       LIMIT 1`,
      [id, token]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Comanda nu a fost găsită sau token invalid." },
        { status: 404 }
      );
    }

    const order = rows[0];
    // Check if the order is in a returnable state
    if (!canRequestReturn({
      status: order.status,
      fulfillmentStatus: order.metadata?.fulfillment_status,
      metadata: order.metadata,
      trackingNumber: order.metadata?.tracking_number,
    })) {
      return NextResponse.json(
        {
          error: "Returul este disponibil doar dupa expedierea sau livrarea comenzii.",
        },
        { status: 422 }
      );
    }

    // Check if a return was already requested
    if (order.status === "return_requested" || order.metadata?.return_reason) {
      return NextResponse.json(
        { error: "O cerere de retur a fost deja înregistrată pentru această comandă." },
        { status: 409 }
      );
    }

    // Update order: set status to 'return_requested' and store the reason in metadata
    await dbQuery(
      `UPDATE commerce_orders
       SET status = 'return_requested',
           metadata = metadata || jsonb_build_object(
             'return_reason', $1::text,
             'return_requested_at', NOW()::text,
             'return_status', 'requested'
           )
       WHERE id = $2::uuid`,
      [reason.trim(), order.id]
    );

    console.log(`[Return Request] Order ${order.id} — reason: "${reason.trim()}"`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Return Request Error]");
    return NextResponse.json(
      { error: "Eroare internă. Încearcă din nou." },
      { status: 500 }
    );
  }
}
