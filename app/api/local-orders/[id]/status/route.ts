/**
 * Status comandă locală — actualizat de merchant sau de curierul atribuit.
 * PATCH /api/local-orders/[id]/status  { status, reason? }
 *
 * Tranzițiile permise sunt validate strict; fiecare rol poate face doar
 * schimbările care îl privesc.
 */
import { NextResponse } from "next/server";
import { dbQuery, withTransaction } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { LocalOrderStatusSchema, parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** cine poate trece comanda în starea X, și din ce stări */
const TRANSITIONS: Record<string, { from: string[]; actor: "merchant" | "courier" }> = {
  accepted:   { from: ["placed"], actor: "merchant" },
  rejected:   { from: ["placed"], actor: "merchant" },
  preparing:  { from: ["accepted"], actor: "merchant" },
  ready:      { from: ["preparing", "accepted"], actor: "merchant" },
  cancelled:  { from: ["placed", "accepted", "preparing"], actor: "merchant" },
  picked_up:  { from: ["ready"], actor: "courier" },
  delivering: { from: ["picked_up"], actor: "courier" },
  delivered:  { from: ["delivering", "picked_up"], actor: "courier" },
};

const TIMESTAMP_COL: Record<string, string> = {
  accepted: "accepted_at",
  ready: "ready_at",
  picked_up: "picked_up_at",
  delivered: "delivered_at",
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const raw = await req.json().catch(() => null);
    const parsed = parseBody(LocalOrderStatusSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { status, reason } = parsed.data;

    const rule = TRANSITIONS[status];
    if (!rule) {
      return NextResponse.json({ success: false, error: "Status invalid." }, { status: 400 });
    }

    // Identifică actorul
    const sellerId = await getSellerSessionId();
    const session = await getAuthSession();
    let courierId: string | null = null;
    if (session?.userId) {
      const { rows } = await dbQuery(
        `SELECT id FROM couriers WHERE user_id = $1 AND verification_status = 'approved'`,
        [session.userId],
      );
      courierId = rows[0]?.id ?? null;
    }
    if (rule.actor === "merchant" && !sellerId) {
      return NextResponse.json({ success: false, error: "Doar restaurantul poate face asta." }, { status: 403 });
    }
    if (rule.actor === "courier" && !courierId) {
      return NextResponse.json({ success: false, error: "Doar curierul poate face asta." }, { status: 403 });
    }

    const updated = await withTransaction(async (q) => {
      const { rows } = await q(
        `SELECT lo.id, lo.status, lo.courier_id, m.seller_id
           FROM local_orders lo JOIN local_merchants m ON m.id = lo.merchant_id
          WHERE lo.id = $1 FOR UPDATE`,
        [id],
      );
      const o = rows[0];
      if (!o) return { ok: false as const, error: "Comanda nu există.", code: 404 };

      if (rule.actor === "merchant" && o.seller_id !== sellerId) {
        return { ok: false as const, error: "Nu e comanda ta.", code: 403 };
      }
      if (rule.actor === "courier" && o.courier_id !== courierId) {
        return { ok: false as const, error: "Nu ești curierul acestei comenzi.", code: 403 };
      }
      if (!rule.from.includes(o.status)) {
        return {
          ok: false as const,
          error: `Nu poți trece din "${o.status}" în "${status}".`,
          code: 409,
        };
      }

      const tsCol = TIMESTAMP_COL[status];
      const { rows: res } = await q(
        `UPDATE local_orders
            SET status = $2,
                cancel_reason = COALESCE($3, cancel_reason),
                ${tsCol ? `${tsCol} = now(),` : ""}
                updated_at = now()
          WHERE id = $1
        RETURNING id, order_number, status, updated_at`,
        [id, status, reason ?? null],
      );

      if (status === "delivered" && o.courier_id) {
        await q(
          `UPDATE couriers SET completed_deliveries = completed_deliveries + 1, updated_at = now()
            WHERE id = $1`,
          [o.courier_id],
        );
      }
      return { ok: true as const, order: res[0] };
    });

    if (!updated.ok) {
      return NextResponse.json({ success: false, error: updated.error }, { status: updated.code });
    }
    return NextResponse.json({ success: true, order: updated.order });
  } catch (error: unknown) {
    logger.error({ err: error }, "[local-orders/status] error");
    return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
  }
}
