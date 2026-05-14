/**
 * PATCH /api/age-verification/opt-in
 *
 * Toggles the user's `adult_content_opt_in`.
 * Allowed only when the user is age-approved.
 *
 * Body: { optIn: boolean }
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const optIn = Boolean(body?.optIn);

    const { rows } = await dbQuery<{ approved: boolean }>(
      `SELECT (age_verification_status = 'approved') AS approved
         FROM users WHERE id = $1`,
      [session.userId]
    );

    if (!rows[0]?.approved) {
      return NextResponse.json(
        { error: "Age verification required before enabling adult content." },
        { status: 403 }
      );
    }

    await dbQuery(
      `UPDATE users SET adult_content_opt_in = $1 WHERE id = $2`,
      [optIn, session.userId]
    );

    return NextResponse.json({ ok: true, optIn });
  } catch (err: any) {
    console.error("[age-verification/opt-in]", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
