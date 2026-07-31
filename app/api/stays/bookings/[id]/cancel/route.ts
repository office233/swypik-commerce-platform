/**
 * POST /api/stays/bookings/[id]/cancel — anulare rezervare.
 *
 * Clientul își anulează propria rezervare (politica: 100% refund cu ≥N zile
 * înainte de check-in, 50% sub N; N = STAYS_FREE_CANCEL_DAYS, default 5).
 * Gazda anulează rezervarea primită → refund integral client, gazda debitată.
 * Cine e caller-ul se deduce din relația cu rezervarea.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { cancelByGuest, cancelByHost } from "@/lib/stays/cancellation";
import { notifyCancellation } from "@/lib/stays/notifications";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit("stays:cancel", getClientIP(req), { limit: 10, window: 3600 });
    if (!rl.success) return NextResponse.json({ error: "Prea multe încercări." }, { status: 429 });

    const { id } = await params;

    // E clientul sau gazda acestei rezervări?
    const { rows } = await dbQuery<{ guest: string | null; host: string | null }>(
        `SELECT b.guest_user_id::text AS guest, p.metadata->>'host_user_id' AS host
           FROM stay_bookings b JOIN marketplace_products p ON p.id = b.product_id
          WHERE b.id = $1::uuid`,
        [id],
    );
    const rel = rows[0];
    if (!rel) return NextResponse.json({ error: "Rezervare inexistentă." }, { status: 404 });

    try {
        let result;
        let cancelledBy: "guest" | "host";
        if (rel.guest === session.userId) {
            result = await cancelByGuest(id, session.userId);
            cancelledBy = "guest";
        } else if (rel.host === session.userId) {
            result = await cancelByHost(id, session.userId);
            cancelledBy = "host";
        } else {
            return NextResponse.json({ error: "Nu ai acces la această rezervare." }, { status: 403 });
        }

        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

        void notifyCancellation(id, cancelledBy, result.refundCents, result.refundPct);
        return NextResponse.json({ ok: true, refundCents: result.refundCents, refundPct: result.refundPct });
    } catch (err) {
        logger.error({ err, bookingId: id }, "stay cancel failed");
        return NextResponse.json({ error: "Anularea a eșuat." }, { status: 500 });
    }
}
