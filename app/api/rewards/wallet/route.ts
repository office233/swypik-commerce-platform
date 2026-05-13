import { NextResponse } from "next/server";
import { getWalletBalance } from "@/lib/rewards/engine";
import { getOptionalSocialUserId } from "@/lib/social/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getOptionalSocialUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallet = await getWalletBalance(userId);

    return NextResponse.json(wallet);
  } catch (error: any) {
    console.error("Wallet API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch wallet balance" },
      { status: 500 }
    );
  }
}
