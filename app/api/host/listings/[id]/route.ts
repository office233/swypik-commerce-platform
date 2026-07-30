/**
 * PATCH  /api/host/listings/[id] — editează / publică / retrage un listing.
 *   Body: { title?, description?, pricePerNightCents?, imageUrl?, maxGuests?,
 *           action?: "publish" | "unpublish" }
 * DELETE /api/host/listings/[id] — șterge listingul (doar dacă n-are rezervări).
 *
 * Autorizare: doar proprietarul (metadata.host_user_id) poate modifica.
 * Publicarea cere poză + preț + oraș — altfel listingul ar apărea gol în /stays.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
    title: z.string().min(5).max(140).optional(),
    description: z.string().max(4000).optional(),
    pricePerNightCents: z.number().int().min(2000).max(100000000).optional(),
    imageUrl: z.string().url().max(600).optional(),
    maxGuests: z.number().int().min(1).max(50).optional(),
    action: z.enum(["publish", "unpublish"]).optional(),
});

async function ownedListing(id: string, userId: string) {
    const { rows } = await dbQuery<{
        id: string; image_url: string | null; price_cents: number | null;
        location_city: string | null; status: string; metadata: any;
    }>(
        `SELECT id::text, image_url, price_cents, location_city, status, metadata
           FROM marketplace_products
          WHERE id = $1::uuid AND listing_type = 'listing' AND metadata->>'host_user_id' = $2`,
        [id, userId],
    );
    return rows[0] ?? null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const existing = await ownedListing(id, session.userId);
    if (!existing) return NextResponse.json({ error: "Listing inexistent" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    const d = parsed.data;

    // Publicare: cere date complete, altfel apare gol în căutare.
    if (d.action === "publish") {
        const img = d.imageUrl ?? existing.image_url;
        const price = d.pricePerNightCents ?? existing.price_cents;
        if (!img) return NextResponse.json({ error: "Adaugă o poză înainte de publicare." }, { status: 400 });
        if (!price) return NextResponse.json({ error: "Setează prețul pe noapte." }, { status: 400 });
        if (!existing.location_city) return NextResponse.json({ error: "Lipsește localitatea." }, { status: 400 });
    }

    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (d.title !== undefined) { sets.push(`title = $${i++}`); vals.push(d.title); }
    if (d.description !== undefined) { sets.push(`description = $${i++}`); vals.push(d.description); }
    if (d.pricePerNightCents !== undefined) { sets.push(`price_cents = $${i++}`); vals.push(d.pricePerNightCents); }
    if (d.imageUrl !== undefined) { sets.push(`image_url = $${i++}`); vals.push(d.imageUrl); }
    if (d.maxGuests !== undefined) {
        sets.push(`metadata = metadata || jsonb_build_object('max_guests', $${i++}::int)`);
        vals.push(d.maxGuests);
    }
    if (d.action === "publish") { sets.push(`status = 'active'`); }
    if (d.action === "unpublish") { sets.push(`status = 'draft'`); }
    if (!sets.length) return NextResponse.json({ error: "Nimic de modificat" }, { status: 400 });

    sets.push(`updated_at = NOW()`);
    vals.push(id, session.userId);
    const { rows } = await dbQuery<{ status: string }>(
        `UPDATE marketplace_products SET ${sets.join(", ")}
          WHERE id = $${i++}::uuid AND metadata->>'host_user_id' = $${i}
          RETURNING status`,
        vals,
    );
    if (!rows.length) return NextResponse.json({ error: "Actualizare eșuată" }, { status: 404 });

    if (d.action) logger.info({ listingId: id, action: d.action }, "host listing status changed");
    return NextResponse.json({ ok: true, status: rows[0].status });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;

    const existing = await ownedListing(id, session.userId);
    if (!existing) return NextResponse.json({ error: "Listing inexistent" }, { status: 404 });

    const booked = await dbQuery<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM stay_bookings
          WHERE product_id = $1::uuid AND check_out >= CURRENT_DATE AND status <> 'cancelled'`,
        [id],
    );
    if (Number(booked.rows[0]?.n ?? 0) > 0) {
        return NextResponse.json({ error: "Are rezervări active — retrage-l din publicare în loc să-l ștergi." }, { status: 409 });
    }

    await dbQuery(`DELETE FROM marketplace_products WHERE id = $1::uuid AND metadata->>'host_user_id' = $2`, [id, session.userId]);
    return NextResponse.json({ ok: true });
}
