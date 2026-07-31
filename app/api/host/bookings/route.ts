/**
 * GET /api/host/bookings — rezervările primite de gazda curentă, pe toate
 * listingurile ei. Include datele de contact ale clientului (gazda trebuie
 * să-l poată suna) și starea plății.
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async function GET() {
    const session = await getAuthSession().catch(() => null);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { rows } = await dbQuery(
        `SELECT b.id::text, b.check_in::text, b.check_out::text, b.guests_count,
                b.total_cents, b.currency, b.status, b.payment_status,
                b.guest_name, b.guest_email, b.guest_phone, b.created_at::text,
                p.id::text AS listing_id, p.title AS listing_title, p.image_url
           FROM stay_bookings b
           JOIN marketplace_products p ON p.id = b.product_id
          WHERE p.metadata->>'host_user_id' = $1
          ORDER BY b.check_in DESC
          LIMIT 100`,
        [session.userId],
    );
    return NextResponse.json({ bookings: rows });
});
