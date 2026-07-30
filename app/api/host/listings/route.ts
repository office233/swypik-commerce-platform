/**
 * Panoul gazdei — listinguri de cazare.
 *
 * GET  /api/host/listings — listingurile gazdei curente (orice status).
 * POST /api/host/listings — creează listing (doar gazde APROBATE).
 *
 * Model: rând în marketplace_products cu listing_type='listing',
 * taxonomy vacation-rentals; legătura cu gazda prin metadata.host_user_id.
 * Publicarea (status='active') e permisă doar cu poză + preț + oraș setate.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE_TAXONOMY: Record<string, string> = {
    apartament: "vacation-rentals/apartments",
    casa: "vacation-rentals/houses",
    vila: "vacation-rentals/houses",
    cabana: "vacation-rentals/cabins",
    pensiune: "vacation-rentals/hotels",
    hotel: "vacation-rentals/hotels",
};

async function approvedApplication(userId: string) {
    const { rows } = await dbQuery<{ id: string; property_type: string; city: string; county: string; max_guests: number }>(
        `SELECT id, property_type, city, county, max_guests FROM host_applications
         WHERE user_id = $1 AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1`,
        [userId],
    );
    return rows[0] ?? null;
}

export async function GET() {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { rows } = await dbQuery(
        `SELECT id::text, title, description, image_url, price_cents, status,
                location_city, metadata, created_at::text
           FROM marketplace_products
          WHERE listing_type = 'listing' AND metadata->>'host_user_id' = $1
          ORDER BY created_at DESC`,
        [session.userId],
    );
    const app = await approvedApplication(session.userId);
    return NextResponse.json({ approved: Boolean(app), listings: rows });
}

const createSchema = z.object({
    title: z.string().min(5).max(140),
    description: z.string().max(4000).optional(),
    pricePerNightCents: z.number().int().min(2000).max(100000000), // min 20 lei/noapte
    imageUrl: z.string().url().max(600).optional(),
    maxGuests: z.number().int().min(1).max(50).optional(),
});

export async function POST(req: Request) {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "Autentifică-te mai întâi." }, { status: 401 });

    const rl = await rateLimit("host:listings", getClientIP(req), { limit: 10, window: 3600 });
    if (!rl.success) return NextResponse.json({ error: "Prea multe încercări." }, { status: 429 });

    const app = await approvedApplication(session.userId);
    if (!app) {
        return NextResponse.json(
            { error: "Poți publica doar după aprobarea aplicației de gazdă.", code: "not_approved" },
            { status: 403 },
        );
    }

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Date invalide" }, { status: 400 });
    }
    const d = parsed.data;

    const slugBase = d.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    const slug = `${slugBase}-${Date.now().toString(36)}`;

    const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO marketplace_products
            (title, description, slug, image_url, price_cents, currency, status,
             listing_type, taxonomy_node_slug, location_country, location_city,
             metadata)
         VALUES ($1,$2,$3,$4,$5,'RON','draft','listing',$6,'RO',$7,$8::jsonb)
         RETURNING id::text`,
        [
            d.title, d.description ?? null, slug, d.imageUrl ?? null, d.pricePerNightCents,
            TYPE_TAXONOMY[app.property_type] ?? "vacation-rentals",
            app.city,
            JSON.stringify({
                host_user_id: session.userId,
                host_application_id: app.id,
                vertical: "stays",
                property_type: app.property_type,
                county: app.county,
                max_guests: d.maxGuests ?? app.max_guests,
                price_unit: "night",
            }),
        ],
    );
    logger.info({ listingId: rows[0].id, host: session.userId }, "host listing created (draft)");
    return NextResponse.json({ ok: true, listingId: rows[0].id, status: "draft" });
}
