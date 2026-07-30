/**
 * GET /api/stays/local?city=Brasov — cazările gazdelor Swypik (publicate).
 * Public. Prețul afișat = prețul gazdei (comisionul de 10% se oprește din
 * plată la rezervare, nu se adaugă peste — gazda își asumă prețul final).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const city = url.searchParams.get("city")?.trim() || null;

    const params: any[] = [];
    let where = `listing_type = 'listing' AND status = 'active' AND metadata->>'vertical' = 'stays'`;
    if (city) {
        params.push(city);
        where += ` AND lower(location_city) = lower($1)`;
    }

    const { rows } = await dbQuery(
        `SELECT id::text, title, description, image_url, price_cents, currency,
                location_city, metadata->>'property_type' AS property_type,
                (metadata->>'max_guests')::int AS max_guests
           FROM marketplace_products
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT 60`,
        params,
    );
    return NextResponse.json({ listings: rows });
}
