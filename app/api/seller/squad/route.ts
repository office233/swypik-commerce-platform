import { NextResponse } from "next/server";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { getSquadsForSeller } from "@/lib/squad/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    return NextResponse.json({ error: "Neautorizat: sesiune comerciant lipsă." }, { status: 401 });
  }

  try {
    const data = await getSquadsForSeller(sellerId, 50);
    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Eroare la obținerea campaniilor Squad." }, { status: 500 });
  }
}
