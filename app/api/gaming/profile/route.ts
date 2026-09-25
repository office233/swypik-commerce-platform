import { NextResponse } from "next/server";
import { getAccountUserId } from "@/lib/social/session";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/security/rate-limit";
import { syncActivityXp } from "@/lib/gaming/activity-xp";
import { getLevelBadge } from "@/lib/gaming/level";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/gaming/profile — level/XP badge for the signed-in account.
 * Reconciles XP for real platform actions first (idempotent), so watching,
 * a first upload or a first purchase show up without touching those flows.
 */
export async function GET() {
  if (!isEnabled("gaming")) return frozenResponse("gaming");

  try {
    // XP doar pentru conturi reale; vizitatorii nu creează rânduri `users` (audit G2).
    const userId = await getAccountUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("gamingProfile", userId, { limit: 30, window: 60 });
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const syncedXp = await syncActivityXp(userId);
    const badge = await getLevelBadge(userId);

    return NextResponse.json({ ok: true, ...badge, syncedXp });
  } catch (err) {
    logger.error({ err }, "[gaming.profile] failed");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
