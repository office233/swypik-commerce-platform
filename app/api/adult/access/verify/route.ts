/**
 * Age verification entry point.
 *
 * POST — opens a verification session with the configured KYC provider
 *        and returns a hostedUrl the client should redirect to.
 *
 * Self-attestation is NOT acceptable.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";
import { upsertUserMirror } from "@/lib/adult/userMirror";
import { createVeriffSession, veriffConfigured } from "@/lib/adult/providers/veriff";
import { writeAuditFromRequest } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const region = req.headers.get("cf-ipcountry") || null;
  const BLOCKED_REGIONS = new Set<string>(
    (process.env.ADULT_BLOCKED_COUNTRIES || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
  );
  if (region && BLOCKED_REGIONS.has(region.toUpperCase())) {
    return NextResponse.json({ error: "region_blocked", region }, { status: 451 });
  }

  // Best-effort mirror so adult.* tables can FK to user_id without
  // pulling public.users across DBs.
  void upsertUserMirror({ userId: user.userId, email: (user as any).email ?? null, role: (user as any).role ?? null });

  const provider = (process.env.ADULT_KYC_PROVIDER || "").toLowerCase();

  if (provider === "veriff") {
    if (!veriffConfigured()) {
      return NextResponse.json(
        { error: "kyc_not_configured", message: "Veriff env vars missing." },
        { status: 503 },
      );
    }
    try {
      const session = await createVeriffSession({ userId: user.userId });
      await adultQuery(
        `INSERT INTO adult.age_verifications(user_id, provider, provider_session_ref, status)
              VALUES ($1, 'veriff', $2, 'pending')`,
        [user.userId, session.sessionId],
      );
      await writeAuditFromRequest({
        actorUserId: user.userId,
        action: "age_verification.session_created",
        targetType: "age_verification",
        targetId: session.sessionId,
        afterState: { provider: "veriff", region },
      });
      return NextResponse.json({ verificationId: session.sessionId, hostedUrl: session.url });
    } catch (e: any) {
      await writeAuditFromRequest({
        actorUserId: user.userId,
        action: "age_verification.session_failed",
        targetType: "age_verification",
        targetId: "none",
        reason: String(e?.message || e).slice(0, 500),
      });
      return NextResponse.json({ error: "provider_error", message: String(e?.message || e) }, { status: 502 });
    }
  }

  if (!provider) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "kyc_not_configured", message: "Age verification provider not configured." },
        { status: 503 },
      );
    }
    // Dev-only stub.
    const { rows } = await adultQuery<{ id: string }>(
      `INSERT INTO adult.age_verifications(user_id, provider, provider_session_ref, status)
            VALUES ($1, 'manual_admin', $2, 'pending')
       RETURNING id::text`,
      [user.userId, `dev_${Date.now()}`],
    );
    return NextResponse.json({
      stub: true,
      verificationId: rows[0].id,
      hostedUrl: `/adult/verify/dev-callback?id=${rows[0].id}`,
    });
  }

  return NextResponse.json(
    { error: "not_implemented", message: `Provider ${provider} adapter not yet wired.` },
    { status: 501 },
  );
}
