/**
 * Age verification entry point.
 *
 * POST — opens a verification session with the configured KYC provider
 *        and returns a hostedUrl the client should redirect to.
 *        Stubbed: real Veriff/Sumsub/Ondato SDK wiring lands in a
 *        dedicated session. Production deploy without a real provider
 *        returns 503.
 *
 * Webhook from the provider (separate route, not in this file) flips
 * adult.access_grants.viewer_verified to TRUE.
 *
 * Self-attestation ("just click I am 18+") is NOT acceptable and is not
 * implemented. EU DSA art. 28 and Mastercard adult content standards
 * require strong age assurance for adult content.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Region check — some jurisdictions block adult access entirely.
  const region = req.headers.get("cf-ipcountry") || req.headers.get("x-country") || null;
  const BLOCKED_REGIONS = new Set<string>([]); // populate from env / sanctions list

  if (region && BLOCKED_REGIONS.has(region)) {
    return NextResponse.json(
      { error: "region_blocked", region },
      { status: 451 },
    );
  }

  const provider = process.env.ADULT_KYC_PROVIDER; // 'veriff' | 'sumsub' | 'ondato'
  if (!provider) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "kyc_not_configured", message: "Age verification provider not configured." },
        { status: 503 },
      );
    }
    // Dev-only stub: create a pending row and return a fake URL the admin
    // can hit to approve. Never reachable in prod.
    const { rows } = await dbQuery<{ id: string }>(
      `INSERT INTO adult.age_verifications(user_id, provider, provider_session_ref, status)
            VALUES ($1, 'manual_admin', $2, 'pending')
       RETURNING id::text`,
      [user.id, `dev_${Date.now()}`],
    );
    return NextResponse.json({
      stub: true,
      verificationId: rows[0].id,
      hostedUrl: `/adult/verify/dev-callback?id=${rows[0].id}`,
    });
  }

  // Real provider wiring happens here in a future session.
  return NextResponse.json(
    { error: "not_implemented", message: `Provider ${provider} adapter not yet wired.` },
    { status: 501 },
  );
}
