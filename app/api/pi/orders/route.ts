/**
 * GET /api/pi/orders
 *
 * Lists the authenticated Pi user's orders that were paid with Pi. Pi-safe:
 * shows amount in Pi (from the pi_payments snapshot), never the RON/fiat side.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await getAuthUser();
  if (!auth.userId) {
    return NextResponse.json({ orders: [], authenticated: false }, { status: 200 });
  }

  const { rows } = await dbQuery<{
    order_id: string;
    amount_pi: string;
    status: string;
    txid: string | null;
    created_at: string;
    completed_at: string | null;
  }>(
    `SELECT pp.order_id, pp.amount_pi, pp.status, pp.txid, pp.created_at, pp.completed_at
       FROM pi_payments pp
      WHERE pp.user_id = $1 AND pp.status = 'completed'
      ORDER BY pp.completed_at DESC NULLS LAST, pp.created_at DESC
      LIMIT 50`,
    [auth.userId],
  );

  return NextResponse.json({
    authenticated: true,
    orders: rows.map((r) => ({
      orderId: r.order_id,
      amountPi: Number(r.amount_pi),
      status: r.status,
      txid: r.txid,
      date: r.completed_at || r.created_at,
    })),
  });
}
