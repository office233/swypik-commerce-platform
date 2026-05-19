/**
 * Veriff decision webhook — HMAC verified, idempotent.
 *
 * Looks up by provider_session_ref in BOTH adult.age_verifications
 * (viewer age) and adult.creator_kyc (creator identity). Updates
 * whichever match exists and grants access accordingly.
 */

import { NextResponse } from "next/server";
import { adultQuery, adultTx } from "@/lib/adult/db";
import { parseVeriffDecision, verifyVeriffSignature } from "@/lib/adult/providers/veriff";
import { writeAudit } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-hmac-signature");

  if (!verifyVeriffSignature(raw, sig)) {
    await writeAudit({
      actorUserId: null,
      action: "veriff.webhook.bad_signature",
      targetType: "webhook",
      targetId: "veriff",
      reason: "signature mismatch",
      ipAddress: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const decision = parseVeriffDecision(payload);
  if (!decision) {
    await writeAudit({
      actorUserId: null,
      action: "veriff.webhook.unparseable",
      targetType: "webhook",
      targetId: "veriff",
      afterState: { sample: JSON.stringify(payload).slice(0, 500) },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Locate matching rows (viewer AND/OR creator).
  const { rows: ageRows } = await adultQuery<{ user_id: string }>(
    `SELECT user_id::text FROM adult.age_verifications
      WHERE provider = 'veriff' AND provider_session_ref = $1
      ORDER BY created_at DESC LIMIT 1`,
    [decision.sessionId],
  );
  const { rows: kycRows } = await adultQuery<{ user_id: string }>(
    `SELECT user_id::text FROM adult.creator_kyc
      WHERE provider = 'veriff' AND provider_ref = $1
      LIMIT 1`,
    [decision.sessionId],
  );

  const ageUser = ageRows[0]?.user_id || null;
  const kycUser = kycRows[0]?.user_id || null;
  const fallbackUser = decision.vendorData || null;

  if (!ageUser && !kycUser) {
    await writeAudit({
      actorUserId: fallbackUser,
      action: "veriff.webhook.no_match",
      targetType: "veriff_session",
      targetId: decision.sessionId,
      afterState: { status: decision.status },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ignored: true });
  }

  await adultTx(async (client) => {
    if (ageUser) {
      await client.query(
        `UPDATE adult.age_verifications
            SET status = $1, rejection_reason = $2,
                result_metadata = COALESCE(result_metadata,'{}'::jsonb) || $3::jsonb,
                decided_at = now()
          WHERE provider = 'veriff' AND provider_session_ref = $4`,
        [decision.status, decision.rejectionReason, JSON.stringify({ decision: decision.raw }), decision.sessionId],
      );
      if (decision.status === "approved") {
        await client.query(
          `INSERT INTO adult.access_grants
              (user_id, viewer_verified, verified_at, verification_method, expires_at)
           VALUES ($1, TRUE, now(), '3p_provider', now() + ($2 || ' milliseconds')::interval)
           ON CONFLICT (user_id) DO UPDATE
              SET viewer_verified = TRUE,
                  verified_at = EXCLUDED.verified_at,
                  verification_method = '3p_provider',
                  expires_at = EXCLUDED.expires_at,
                  blocked_reason = NULL`,
          [ageUser, String(FIVE_YEARS_MS)],
        );
      }
    }

    if (kycUser) {
      const kycStatus = decision.status === "approved" ? "approved"
        : decision.status === "declined" ? "rejected"
        : decision.status === "review" ? "review"
        : "pending";
      await client.query(
        `UPDATE adult.creator_kyc
            SET status = $1,
                rejection_reason = $2,
                reviewed_at = CASE WHEN $1 IN ('approved','rejected') THEN now() ELSE reviewed_at END
          WHERE provider = 'veriff' AND provider_ref = $3`,
        [kycStatus, decision.rejectionReason, decision.sessionId],
      );
    }
  });

  await writeAudit({
    actorUserId: ageUser || kycUser || fallbackUser,
    action: `veriff.decision.${decision.status}`,
    targetType: kycUser ? "creator_kyc" : "age_verification",
    targetId: decision.sessionId,
    afterState: { status: decision.status, rejectionReason: decision.rejectionReason, ageUser, kycUser },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
