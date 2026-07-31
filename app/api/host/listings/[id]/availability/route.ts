/**
 * Calendar disponibilitate — gazda blochează/deblochează zile.
 *
 * GET  /api/host/listings/[id]/availability?from=..&to=..
 *   → zile blocate de gazdă + zile ocupate de rezervări (read-only).
 * POST /api/host/listings/[id]/availability
 *   Body: { dates: ["YYYY-MM-DD", ...], available: boolean, priceCentsOverride?: number|null }
 *   → setează blocare sau preț special pe zilele date (max 366 / apel).
 *
 * Autorizare: doar proprietarul listingului.
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function ownsListing(id: string, userId: string): Promise<boolean> {
    const { rows } = await dbQuery(
        `SELECT 1 FROM marketplace_products
          WHERE id = $1::uuid AND listing_type = 'listing' AND metadata->>'host_user_id' = $2`,
        [id, userId],
    );
    return rows.length > 0;
}

export const GET = withErrorHandling(async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!(await ownsListing(id, session.userId))) {
        return NextResponse.json({ error: "Listing inexistent" }, { status: 404 });
    }

    const sp = new URL(req.url).searchParams;
    const from = DATE.test(sp.get("from") ?? "") ? sp.get("from")! : new Date().toISOString().slice(0, 10);
    const to = DATE.test(sp.get("to") ?? "")
        ? sp.get("to")!
        : new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

    const blocked = await dbQuery<{ day: string; price_cents_override: number | null }>(
        `SELECT day::text, price_cents_override FROM stay_availability
          WHERE product_id = $1::uuid AND day >= $2::date AND day <= $3::date AND is_available = false`,
        [id, from, to],
    );
    const priced = await dbQuery<{ day: string; price_cents_override: number }>(
        `SELECT day::text, price_cents_override FROM stay_availability
          WHERE product_id = $1::uuid AND day >= $2::date AND day <= $3::date
            AND is_available = true AND price_cents_override IS NOT NULL`,
        [id, from, to],
    );
    const booked = await dbQuery<{ check_in: string; check_out: string }>(
        `SELECT check_in::text, check_out::text FROM stay_bookings
          WHERE product_id = $1::uuid AND status IN ('pending','confirmed')
            AND check_out >= $2::date AND check_in <= $3::date`,
        [id, from, to],
    );

    return NextResponse.json({
        blockedDays: blocked.rows.map((r) => r.day),
        pricedDays: priced.rows,
        bookedRanges: booked.rows,
    });
});

const postSchema = z.object({
    dates: z.array(z.string().regex(DATE)).min(1).max(366),
    available: z.boolean(),
    priceCentsOverride: z.number().int().min(2000).max(100000000).nullable().optional(),
});

export const POST = withErrorHandling(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;
    if (!(await ownsListing(id, session.userId))) {
        return NextResponse.json({ error: "Listing inexistent" }, { status: 404 });
    }

    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    const { dates, available, priceCentsOverride } = parsed.data;

    // Nu permite blocarea zilelor cu rezervări active — clientul a plătit deja.
    if (!available) {
        const clash = await dbQuery<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM stay_bookings
              WHERE product_id = $1::uuid AND status IN ('pending','confirmed')
                AND daterange(check_in, check_out) && ANY(
                    SELECT daterange(d::date, (d::date + 1))
                      FROM unnest($2::text[]) AS d
                )`,
            [id, dates],
        );
        if (Number(clash.rows[0]?.n ?? 0) > 0) {
            return NextResponse.json(
                { error: "Unele zile au rezervări plătite — nu pot fi blocate." },
                { status: 409 },
            );
        }
    }

    await dbQuery(
        `INSERT INTO stay_availability (product_id, day, is_available, price_cents_override)
         SELECT $1::uuid, d::date, $3, $4
           FROM unnest($2::text[]) AS d
         ON CONFLICT (product_id, day)
         DO UPDATE SET is_available = EXCLUDED.is_available,
                       price_cents_override = EXCLUDED.price_cents_override`,
        [id, dates, available, priceCentsOverride ?? null],
    );

    return NextResponse.json({ ok: true, updated: dates.length });
});
