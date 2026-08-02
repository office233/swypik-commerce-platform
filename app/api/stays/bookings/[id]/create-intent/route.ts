/**
 * POST /api/stays/bookings/[id]/create-intent — plată cu CARDUL (Stripe
 * Payment Element) pentru o rezervare de cazare, alternativă la plata din
 * wallet (/pay).
 *
 * Confirmarea rezervării + creditul gazdei se fac în webhook
 * (payment_intent.succeeded, metadata.kind = "stay_booking") — NU aici,
 * ca să nu confirmăm fără bani încasați.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getStripe } from "@/lib/stripe/checkout";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const { rows } = await dbQuery<{
        id: string;
        total_cents: number;
        status: string;
        payment_status: string;
        title: string;
        currency: string;
        stripe_payment_intent_id: string | null;
    }>(
        `SELECT b.id::text, b.total_cents, b.status, b.payment_status, p.title,
            b.currency, b.stripe_payment_intent_id
       FROM stay_bookings b
       JOIN marketplace_products p ON p.id = b.product_id
      WHERE b.id = $1::uuid AND b.guest_user_id = $2`,
        [id, session.userId],
    );
    const b = rows[0];
    if (!b) return NextResponse.json({ error: "Rezervare inexistentă" }, { status: 404 });
    if (b.payment_status === "paid") {
        return NextResponse.json({ error: "Rezervarea e deja plătită." }, { status: 409 });
    }
    if (b.status !== "pending") {
        return NextResponse.json({ error: `Rezervarea e ${b.status}.` }, { status: 409 });
    }
    if (!Number.isInteger(b.total_cents) || b.total_cents < 200) {
        return NextResponse.json({ error: "Sumă invalidă." }, { status: 422 });
    }

    const stripe = getStripe();

    // refolosim intent-ul existent dacă mai e utilizabil (evităm dubluri)
    if (b.stripe_payment_intent_id) {
        try {
            const existing = await stripe.paymentIntents.retrieve(b.stripe_payment_intent_id);
            if (
                existing.status !== "canceled" &&
                existing.status !== "succeeded" &&
                existing.amount === b.total_cents
            ) {
                return NextResponse.json({ clientSecret: existing.client_secret });
            }
        } catch {
            /* intent vechi invalid — creăm altul */
        }
    }

    const intent = await stripe.paymentIntents.create({
        amount: b.total_cents,
        currency: (b.currency || "RON").toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
            kind: "stay_booking",
            stay_booking_id: b.id,
            user_id: session.userId,
        },
        description: `Cazare: ${b.title}`,
    });

    await dbQuery(
        `UPDATE stay_bookings SET stripe_payment_intent_id = $2 WHERE id = $1::uuid`,
        [b.id, intent.id],
    );

    logger.info({ bookingId: b.id, intentId: intent.id }, "stay booking card intent created");
    return NextResponse.json({ clientSecret: intent.client_secret });
}
