/**
 * GET /api/stays/quote?productId=..&checkIn=..&checkOut=..&guests=..
 * Preț + disponibilitate pentru un interval. Public (fără efecte secundare).
 * Prețul e mereu calculat server-side.
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { quoteStay } from "@/lib/stays/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withErrorHandling(async function GET(req: Request) {
    const sp = new URL(req.url).searchParams;
    const productId = sp.get("productId") ?? "";
    const checkIn = sp.get("checkIn") ?? "";
    const checkOut = sp.get("checkOut") ?? "";
    const guests = Number(sp.get("guests") ?? 2);

    if (!/^[0-9a-f-]{36}$/i.test(productId) || !DATE.test(checkIn) || !DATE.test(checkOut)) {
        return NextResponse.json({ error: "Parametri invalizi" }, { status: 400 });
    }

    const q = await quoteStay(productId, checkIn, checkOut, Number.isFinite(guests) ? guests : 2);
    if (!q) return NextResponse.json({ error: "Cazare inexistentă" }, { status: 404 });

    return NextResponse.json({
        available: q.available,
        reason: q.reason ?? null,
        nights: q.nights,
        totalCents: q.totalCents,
        currency: q.currency,
    });
});
