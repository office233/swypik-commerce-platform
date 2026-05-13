import { NextResponse } from "next/server";
import { getRewardHistory } from "@/lib/rewards/engine";
import { getOptionalSocialUserId } from "@/lib/social/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getOptionalSocialUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const events = await getRewardHistory(userId, 50);

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error("Reward History API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reward history" },
      { status: 500 }
    );
  }
}
