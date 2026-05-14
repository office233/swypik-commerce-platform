import { NextResponse } from "next/server";
import { callAE } from "@/lib/aliexpress/client";

import { requireAuth } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    // We will test the dropship order get or any basic AE API that doesn't place an order but tests auth.
    // e.g. querying a random dropship product or just testing the connection.
    
    const params = {
      order_id: "test_123" // Invalid order ID just to see if we get Auth Error or Invalid Order error
    };

    const response = await callAE("aliexpress.ds.trade.order.get", params);
    
    return NextResponse.json({
      success: true,
      message: "AE API Connected Successfully!",
      response
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "Internal error",
    }, { status: 500 });
  }
}
