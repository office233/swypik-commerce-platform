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
import { rateLimit } from "@/lib/security/rate-limit";
import { AdultOptInSchema, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("adultOptIn", session.userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(AdultOptInSchema, rawBody);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { optIn } = parsed.data;

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
