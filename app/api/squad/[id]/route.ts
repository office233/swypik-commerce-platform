/**
 * GET /api/squad/[id] — detalii squad cu membri și countdown
 */
import { NextResponse } from "next/server";
import { getSquadDetails } from "@/lib/squad/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const details = await getSquadDetails(id);
    if (!details) {
        return NextResponse.json({ error: "Squad inexistent" }, { status: 404 });
    }

    return NextResponse.json({
        success: true,
        squad: details.squad,
        members: details.members,
        product: details.product,
    });
}
