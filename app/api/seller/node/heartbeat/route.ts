import { NextResponse } from "next/server";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { validateNodeHeartbeat } from "@/lib/node/node-protocol";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const body = await req.json();
    const { nodeId, isOnline, pingMs = 20, pendingSyncCount = 0 } = body;

    const validation = validateNodeHeartbeat({
      nodeId,
      sellerId,
      timestamp: new Date().toISOString(),
      pingMs,
      pendingSyncCount,
      isOnline: !!isOnline,
    });

    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: validation.reason,
        nodeStatus: "disconnected_error",
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      nodeStatus: "online_hosting",
      ackTimestamp: new Date().toISOString(),
      message: "Nodul local este activ și găzduiește magazinul în rețeaua Swypik.",
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
