/** GET /api/partner/ping — verificare API key partener (ERP). */
import { NextResponse } from "next/server";
import { getPartnerSeller } from "../_lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const seller = await getPartnerSeller(req);
    if (!seller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ ok: true, seller_id: seller.id, seller_name: seller.display_name });
}
