/**
 * Admin Fulfillment Actions API
 * POST /api/admin/fulfillment
 * Actions: fulfill, add_tracking, cancel
 */

import { NextResponse } from "next/server";
import { fulfillOrder, updateOrderTracking, cancelOrder } from "@/lib/suppliers/fulfillment";
import { isAdminConfigured } from "@/lib/security/admin-auth";
import { requireAuth } from "@/lib/auth/getAuthUser";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";

export async function POST(req: Request) {
  if (!isEnabled("fulfillment")) return frozenResponse("fulfillment");
  try {
    if (!isAdminConfigured()) {
      return NextResponse.json({ success: false, error: "ADMIN_SECRET is not configured." }, { status: 503 });
    }

    const __auth = await requireAuth(req, ["admin"]);
    if (__auth instanceof NextResponse) return __auth;

    const body = await req.json();
    const { action, orderId, trackingNumber, trackingUrl, reason } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, error: "orderId is required" }, { status: 400 });
    }

    switch (action) {
      case "fulfill": {
        const result = await fulfillOrder(orderId);
        return NextResponse.json(result);
      }

      case "add_tracking": {
        if (!trackingNumber) {
          return NextResponse.json({ success: false, error: "trackingNumber is required" }, { status: 400 });
        }
        const ok = await updateOrderTracking(orderId, trackingNumber, trackingUrl);
        return NextResponse.json({ success: ok, orderId });
      }

      case "cancel": {
        const ok = await cancelOrder(orderId, reason);
        return NextResponse.json({ success: ok, orderId });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[Admin Fulfillment] Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
