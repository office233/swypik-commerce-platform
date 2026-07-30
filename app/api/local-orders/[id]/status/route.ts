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
import { maybeAutoDispatch } from "@/lib/dispatch/auto";
import { getJobForOrder, publishJobEvent } from "@/lib/dispatch/engine";
import { settleLocalOrder } from "@/lib/payments/mobility";
import { sendPushToUser } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** cine poate trece comanda în starea X, și din ce stări */
const TRANSITIONS: Record<string, { from: string[]; actor: "merchant" | "courier" }> = {
    accepted: { from: ["placed"], actor: "merchant" },
    rejected: { from: ["placed"], actor: "merchant" },
    preparing: { from: ["accepted"], actor: "merchant" },
    ready: { from: ["preparing", "accepted"], actor: "merchant" },
    cancelled: { from: ["placed", "accepted", "preparing"], actor: "merchant" },
    picked_up: { from: ["ready"], actor: "courier" },
    delivering: { from: ["picked_up"], actor: "courier" },
    delivered: { from: ["delivering", "picked_up"], actor: "courier" },
};

const TIMESTAMP_COL: Record<string, string> = {
    accepted: "accepted_at",
    ready: "ready_at",
    picked_up: "picked_up_at",
    delivered: "delivered_at",
};

/** Mesaje push către client la schimbarea statusului (best-effort). */
const PUSH_TEXT: Record<string, { title: string; body: string }> = {
    accepted: { title: "Comanda a fost acceptată ✅", body: "Restaurantul ți-a confirmat comanda." },
    rejected: { title: "Comanda a fost refuzată ❌", body: "Restaurantul nu poate onora comanda. Nu ai fost taxat." },
    preparing: { title: "Se prepară 🍳", body: "Comanda ta este în preparare." },
    ready: { title: "Comanda e gata 🛍️", body: "Căutăm un curier pentru livrare." },
    picked_up: { title: "Curierul a preluat comanda 🛵", body: "Comanda e pe drum spre tine." },
    delivering: { title: "În livrare 🚚", body: "Curierul se apropie de adresa ta." },
    delivered: { title: "Livrată! 🎉", body: "Poftă bună! Poți lăsa o recenzie din istoric." },
    cancelled: { title: "Comandă anulată", body: "Comanda a fost anulată." },
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
                `SELECT lo.id, lo.status, lo.courier_id, lo.customer_user_id, lo.order_number, m.seller_id, m.name AS merchant_name
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
            return {
                ok: true as const,
                order: res[0],
                customerUserId: o.customer_user_id as string | null,
                merchantName: o.merchant_name as string,
            };
        });

        if (!updated.ok) {
            return NextResponse.json({ success: false, error: updated.error }, { status: updated.code });
        }

        // Auto-dispatch când comanda devine 'ready' (dacă merchantul are setarea).
        if (status === "ready") {
            await maybeAutoDispatch(id, "ready");
        }

            // FRONT R5 — la livrare: split-ul banilor în wallet ledger (idempotent).
            if (status === "delivered") {
                try {
                    await settleLocalOrder(id);
                } catch (err) {
                    logger.error({ err, orderId: id }, "[local-orders/status] settlement failed");
                }
            }

        // Notifică stream-ul de dispatch la schimbări relevante pentru client.
        if (["picked_up", "delivering", "delivered", "cancelled"].includes(status)) {
            const job = await getJobForOrder(id);
            if (job) {
                await publishJobEvent(job.id, { type: "status", status });
            }
        }

        // Push către client — best-effort, nu blochează răspunsul.
        const push = PUSH_TEXT[status];
        if (push && updated.customerUserId) {
            sendPushToUser(updated.customerUserId, {
                title: push.title,
                body: `${updated.merchantName} · ${push.body}`,
                url: `/food/orders/${id}`,
                tag: `eats-order-${id}`,
            }).catch((err) => logger.warn({ err, orderId: id }, "[local-orders/status] push failed"));
        }

        return NextResponse.json({ success: true, order: updated.order });
    } catch (error: unknown) {
        logger.error({ err: error }, "[local-orders/status] error");
        return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
    }
}
