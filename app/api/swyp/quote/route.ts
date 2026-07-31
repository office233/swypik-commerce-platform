/**
 * GET /api/swyp/quote?totalCents=12345
 * Cât din acest total poate fi plătit în SWYP de utilizatorul logat.
 * Folosit de checkout pentru a afișa opțiunea „plătește parțial în SWYP”.
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthSession } from "@/lib/auth/session";
import { quoteSwypForTotal } from "@/lib/swyp/hybrid-payment";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: Request) => {
    const session = await getAuthSession();
    if (!session) {
        return NextResponse.json({ success: true, available: false, reason: "not_logged_in" });
    }
    const totalCents = Number(new URL(req.url).searchParams.get("totalCents") ?? 0);
    const quote = await quoteSwypForTotal(session.userId, totalCents);
    return NextResponse.json({
        success: true,
        available: !quote.unavailable,
        maxCents: quote.maxCents,
        maxSwyp: (quote.maxCents / 100).toFixed(2),
        balanceSwyp: (Number(quote.balanceUnits) / 100).toFixed(2),
        maxPct: quote.maxPct,
    });
});
