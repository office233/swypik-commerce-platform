/**
 * Cazări de vacanță — rezervări pe nopți.
 *
 * POST /api/stays/bookings — rezervă un interval.
 *   Prețul se calculează server-side din vertical_attributes.price_per_night,
 *   cu override pe zi din stay_availability. Dubla-rezervare e imposibilă:
 *   constraint EXCLUDE pe (product_id, daterange) în DB.
 *
 * GET /api/stays/bookings?product_id=... — zilele ocupate (calendar public).
 */
import { NextResponse } from "next/server";
import { dbQuery, withTransaction } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { StayBookingCreateSchema, parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nightsBetween(checkIn: string, checkOut: string): string[] {
    const out: string[] = [];
    const d = new Date(checkIn + "T00:00:00Z");
    const end = new Date(checkOut + "T00:00:00Z");
    while (d < end) {
        out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
}

export async function POST(req: Request) {
    try {
        const session = await getAuthSession();
        const userId = session?.userId ?? null;

        const rl = await rateLimit("stayBookings", userId ?? req.headers.get("cf-connecting-ip") ?? "anon");
        if (!rl.success) {
            return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
        }

        const raw = await req.json().catch(() => null);
        const parsed = parseBody(StayBookingCreateSchema, raw);
        if (!parsed.ok) {
            return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
        }
        const d = parsed.data;

        const nights = nightsBetween(d.check_in, d.check_out);
        if (nights.length === 0 || nights.length > 365) {
            return NextResponse.json({ success: false, error: "Interval invalid." }, { status: 400 });
        }

        const { rows: products } = await dbQuery(
            `SELECT id, title, currency, vertical_attributes, status, taxonomy_node_slug
         FROM marketplace_products
        WHERE id = $1 AND status = 'active'`,
            [d.product_id],
        );
        const p = products[0];
        if (!p || !String(p.taxonomy_node_slug ?? "").startsWith("vacation-rentals")) {
            return NextResponse.json({ success: false, error: "Cazarea nu există." }, { status: 404 });
        }

        const attrs = (p.vertical_attributes ?? {}) as Record<string, unknown>;
        const basePerNight = Number(attrs.price_per_night);
        if (!Number.isFinite(basePerNight) || basePerNight <= 0) {
            return NextResponse.json({ success: false, error: "Cazarea nu are preț configurat." }, { status: 409 });
        }
        const maxGuests = Number(attrs.max_guests);
        if (Number.isFinite(maxGuests) && d.guests_count > maxGuests) {
            return NextResponse.json(
                { success: false, error: `Maxim ${maxGuests} oaspeți pentru această cazare.` },
                { status: 400 },
            );
        }

        const baseCents = Math.round(basePerNight * 100);

        const booking = await withTransaction(async (q) => {
            // Zile blocate explicit de gazdă?
            const { rows: blocked } = await q(
                `SELECT day FROM stay_availability
          WHERE product_id = $1 AND day = ANY($2::date[]) AND is_available = false`,
                [d.product_id, nights],
            );
            if (blocked.length) {
                return { ok: false as const, error: "Unele nopți nu sunt disponibile.", code: 409 };
            }

            // Prețuri speciale pe zi
            const { rows: overrides } = await q(
                `SELECT day::text AS day, price_cents_override FROM stay_availability
          WHERE product_id = $1 AND day = ANY($2::date[]) AND price_cents_override IS NOT NULL`,
                [d.product_id, nights],
            );
            const overrideMap = new Map(overrides.map((o: any) => [o.day, o.price_cents_override as number]));
            const total = nights.reduce((sum, n) => sum + (overrideMap.get(n) ?? baseCents), 0);

            const { rows } = await q(
                `INSERT INTO stay_bookings (
           product_id, guest_user_id, guest_name, guest_email, guest_phone,
           check_in, check_out, guests_count, total_cents, currency
         ) VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10)
         RETURNING id, check_in, check_out, guests_count, total_cents, currency, status`,
                [
                    d.product_id,
                    userId,
                    d.guest_name,
                    d.guest_email ?? null,
                    d.guest_phone ?? null,
                    d.check_in,
                    d.check_out,
                    d.guests_count,
                    total,
                    p.currency ?? "EUR",
                ],
            );
            return { ok: true as const, booking: rows[0] };
        });

        if (!booking.ok) {
            return NextResponse.json({ success: false, error: booking.error }, { status: booking.code });
        }
        return NextResponse.json({ success: true, booking: booking.booking });
    } catch (error: unknown) {
        // Constraint-ul EXCLUDE lovește exact aici la dublă rezervare concurentă.
        if ((error as { code?: string })?.code === "23P01") {
            return NextResponse.json(
                { success: false, error: "Intervalul tocmai a fost rezervat de altcineva." },
                { status: 409 },
            );
        }
        logger.error({ err: error }, "[stays/bookings] POST error");
        return NextResponse.json({ success: false, error: "Eroare la rezervare." }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const productId = url.searchParams.get("product_id");
        if (!productId) {
            return NextResponse.json({ success: false, error: "product_id lipsă." }, { status: 400 });
        }
        const from = url.searchParams.get("from") || new Date().toISOString().slice(0, 10);
        const to =
            url.searchParams.get("to") ||
            new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);

        const { rows: booked } = await dbQuery(
            `SELECT check_in::text, check_out::text FROM stay_bookings
        WHERE product_id = $1 AND status IN ('pending','confirmed')
          AND check_out >= $2::date AND check_in <= $3::date`,
            [productId, from, to],
        );
        const { rows: blocked } = await dbQuery(
            `SELECT day::text AS day, price_cents_override FROM stay_availability
        WHERE product_id = $1 AND day BETWEEN $2::date AND $3::date`,
            [productId, from, to],
        );

        return NextResponse.json({ success: true, booked, calendar: blocked });
    } catch (error: unknown) {
        logger.error({ err: error }, "[stays/bookings] GET error");
        return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
    }
}
