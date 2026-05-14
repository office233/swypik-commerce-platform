import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Explicit shopper -> creator promotion. Requires authenticated session.
// User must call this (e.g. from /become-a-creator button) before uploading.
export async function POST() {
  try {
    const userId = await getCreatorUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { rows } = await dbQuery<{ role: string }>(
      `SELECT role FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (rows[0].role === "admin" || rows[0].role === "creator") {
      return NextResponse.json({ success: true, role: rows[0].role, alreadyCreator: true });
    }
    if (rows[0].role !== "shopper") {
      return NextResponse.json({ error: "Cannot promote this role" }, { status: 403 });
    }
    await dbQuery(
      `UPDATE users SET role = 'creator', updated_at = now() WHERE id = $1 AND role = 'shopper'`,
      [userId]
    );
    return NextResponse.json({ success: true, role: "creator" });
  } catch (err) {
    logger.error({ err }, "[creator/apply] error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
