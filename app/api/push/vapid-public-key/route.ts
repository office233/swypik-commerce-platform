import { NextResponse } from "next/server";
import { frozenResponse, isEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isEnabled("pushNotifications")) return frozenResponse("pushNotifications");
  const key = process.env.VAPID_PUBLIC_KEY || "";
  return NextResponse.json({ key });
}
