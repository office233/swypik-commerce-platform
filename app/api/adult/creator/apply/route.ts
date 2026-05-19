/**
 * Creator application endpoint.
 *
 * POST — submits legal-name / DoB / document-type / country and creates
 *        a Veriff identity session (or a manual_admin stub in dev).
 *
 * Server-side checks:
 *   - authenticated (we trust the marketplace auth cookie)
 *   - 18+ at DoB (DB CHECK enforces too, this is friendlier UX)
 *   - one pending or approved row per user (409 on duplicate)
 *
 * Approval is flipped by the Veriff webhook (see app/api/adult/webhooks/veriff/route.ts).
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";
import { upsertUserMirror } from "@/lib/adult/userMirror";
import { createVeriffSession, veriffConfigured } from "@/lib/adult/providers/veriff";
import { writeAuditFromRequest } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

interface ApplyBody {
  legal_first_name?: string;
  legal_last_name?: string;
  date_of_birth?: string;     // YYYY-MM-DD
  document_type?: "passport" | "national_id" | "drivers_license";
  address_country?: string;   // ISO-3166 alpha-2
  address_region?: string | null;
  tax_id_ref?: string | null;
  accepted_terms?: boolean;
}

function err(status: number, code: string, message?: string) {
  return NextResponse.json({ error: code, message }, { status });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return err(401, "unauthorized");

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return err(400, "bad_json");
  }

  const {
    legal_first_name, legal_last_name, date_of_birth,
    document_type, address_country, address_region, tax_id_ref, accepted_terms,
  } = body;

  if (!legal_first_name || !legal_last_name || !date_of_birth || !document_type ||
      !address_country || !accepted_terms) {
    return err(400, "missing_fields");
  }
  if (!["passport", "national_id", "drivers_license"].includes(document_type)) {
    return err(400, "bad_document_type");
  }
  if (!/^[A-Z]{2}$/.test(address_country)) {
    return err(400, "bad_country", "Use ISO-3166 alpha-2 (e.g. US, RO, GB).");
  }
  // 18+ check (DoB <= today - 18y)
  const dob = new Date(date_of_birth);
  if (isNaN(dob.getTime())) return err(400, "bad_dob");
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  if (dob > eighteenYearsAgo) return err(400, "underage");

  void upsertUserMirror({ userId: user.userId, email: (user as any).email ?? null, role: (user as any).role ?? null });

  // Reject duplicate active application.
  const { rows: existing } = await adultQuery<{ status: string }>(
    `SELECT status FROM adult.creator_kyc WHERE user_id = $1`,
    [user.userId],
  );
  if (existing[0] && ["pending", "review", "approved"].includes(existing[0].status)) {
    return NextResponse.json(
      { error: "already_applied", status: existing[0].status },
      { status: 409 },
    );
  }

  let provider: string;
  let providerRef: string;
  let hostedUrl: string | null = null;

  if (veriffConfigured() && (process.env.ADULT_KYC_PROVIDER || "").toLowerCase() === "veriff") {
    try {
      const session = await createVeriffSession({ userId: user.userId });
      provider = "veriff";
      providerRef = session.sessionId;
      hostedUrl = session.url;
    } catch (e: any) {
      await writeAuditFromRequest({
        actorUserId: user.userId,
        action: "creator_kyc.veriff_failed",
        targetType: "creator_kyc",
        targetId: user.userId,
        reason: String(e?.message || e).slice(0, 500),
      }).catch(() => {});
      return err(502, "provider_error", String(e?.message || e));
    }
  } else if (process.env.NODE_ENV === "production") {
    return err(503, "kyc_not_configured");
  } else {
    provider = "manual_admin";
    providerRef = `manual_${Date.now()}`;
  }

  await adultQuery(
    `INSERT INTO adult.creator_kyc
       (user_id, legal_first_name, legal_last_name, date_of_birth,
        document_type, provider, provider_ref,
        address_country, address_region, tax_id_ref, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
     ON CONFLICT (user_id) DO UPDATE SET
        legal_first_name = EXCLUDED.legal_first_name,
        legal_last_name = EXCLUDED.legal_last_name,
        date_of_birth = EXCLUDED.date_of_birth,
        document_type = EXCLUDED.document_type,
        provider = EXCLUDED.provider,
        provider_ref = EXCLUDED.provider_ref,
        address_country = EXCLUDED.address_country,
        address_region = EXCLUDED.address_region,
        tax_id_ref = EXCLUDED.tax_id_ref,
        status = 'pending',
        rejection_reason = NULL`,
    [user.userId, legal_first_name, legal_last_name, date_of_birth, document_type,
     provider!, providerRef!, address_country, address_region ?? null, tax_id_ref ?? null],
  );

  await writeAuditFromRequest({
    actorUserId: user.userId,
    action: "creator_kyc.submitted",
    targetType: "creator_kyc",
    targetId: user.userId,
    afterState: { provider: provider!, providerRef: providerRef!, country: address_country },
  }).catch(() => {});

  return NextResponse.json({ status: "pending", hostedUrl, provider: provider!, providerRef: providerRef! });
}

export async function GET() {
  const user = await getAuthUser();
  if (!user.userId) return err(401, "unauthorized");
  const { rows } = await adultQuery<{
    status: string; provider: string; rejection_reason: string | null;
    address_country: string; created_at: string; reviewed_at: string | null;
  }>(
    `SELECT status, provider, rejection_reason, address_country,
            created_at::text, reviewed_at::text
       FROM adult.creator_kyc WHERE user_id = $1`,
    [user.userId],
  );
  if (!rows[0]) return NextResponse.json({ status: "none" });
  return NextResponse.json(rows[0]);
}
