import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await getAuthUser();
    if (!auth.userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    await dbQuery(
      `UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()) WHERE id = $1`,
      [auth.userId],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "[onboarding/complete] error");
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}
