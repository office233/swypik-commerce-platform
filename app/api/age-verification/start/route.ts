/**
 * Stripe Identity — start a verification session.
 *
 * POST /api/age-verification/start
 *
 * Creates a Stripe Identity VerificationSession (document + selfie),
 * stores the session id in `user_age_verifications` with status='pending',
 * and returns the hosted verification URL + client_secret.
 *
 * Requires an authenticated user.
 */
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/checkout";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stripe = getStripe();

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_BASE_URL || "https://swypik.com";
    const returnUrl = `${origin.replace(/\/$/, "")}/account/age-verification?status=processing`;

    const verification = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: { user_id: session.userId },
      options: {
        document: {
          require_matching_selfie: true,
          require_live_capture: true,
          require_id_number: false,
          allowed_types: ["driving_license", "id_card", "passport"],
        },
      },
      return_url: returnUrl,
    });

    await dbQuery(
      `INSERT INTO user_age_verifications (user_id, status, method, provider_session_id, metadata)
       VALUES ($1, 'pending', 'stripe_identity', $2, $3::jsonb)
       ON CONFLICT (user_id) DO UPDATE
         SET status = 'pending',
             method = 'stripe_identity',
             provider_session_id = EXCLUDED.provider_session_id,
             rejection_reason = NULL,
             metadata = EXCLUDED.metadata`,
      [session.userId, verification.id, JSON.stringify({ created_via: "api" })]
    );

    await dbQuery(
      `UPDATE users
         SET age_verification_status = 'pending'
       WHERE id = $1
         AND age_verification_status IN ('none','rejected','expired')`,
      [session.userId]
    );

    return NextResponse.json({
      ok: true,
      verificationSessionId: verification.id,
      clientSecret: verification.client_secret,
      url: verification.url,
    });
  } catch (err: any) {
    console.error("[age-verification/start]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create verification session" },
      { status: 500 }
    );
  }
}
