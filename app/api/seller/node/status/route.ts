import { NextResponse } from "next/server";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { computeNodeState, generateNodeId } from "@/lib/node/node-protocol";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const nodeId = generateNodeId(sellerId);
    const nowIso = new Date().toISOString();
    const status = computeNodeState(true, nowIso);

    return NextResponse.json({
      success: true,
      node: {
        nodeId,
        sellerId,
        status,
        isOnline: true,
        pingMs: 14,
        dbType: "embedded_sqlite",
        syncedItems: 128,
        pendingSync: 0,
        lastHeartbeat: nowIso,
        hostingUrl: `https://swypik.com/u/node-${sellerId.slice(0, 6)}`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
