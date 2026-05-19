/**
 * Veriff decision webhook — HMAC verified, idempotent.
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

  const { rows: verifs } = await adultQuery<{ id: string; user_id: string }>(
    `SELECT id::text, user_id::text FROM adult.age_verifications
      WHERE provider = 'veriff' AND provider_session_ref = $1
      ORDER BY created_at DESC LIMIT 1`,
    [decision.sessionId],
  );

  const userId = verifs[0]?.user_id || decision.vendorData;
  if (!userId) {
    await writeAudit({
      actorUserId: null,
      action: "veriff.webhook.no_user",
      targetType: "age_verification",
      targetId: decision.sessionId,
      afterState: { status: decision.status },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ignored: true });
  }

  await adultTx(async (client) => {
    await client.query(
      `UPDATE adult.age_verifications
          SET status = $1,
              rejection_reason = $2,
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
        [userId, String(FIVE_YEARS_MS)],
      );
    }
  });

  await writeAudit({
    actorUserId: userId,
    action: `veriff.decision.${decision.status}`,
    targetType: "age_verification",
    targetId: decision.sessionId,
    afterState: { status: decision.status, rejectionReason: decision.rejectionReason },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
