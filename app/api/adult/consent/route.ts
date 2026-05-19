/**
 * Consent releases (model releases / 2257 records).
 *
 * Creator records, per performer in their content:
 *   subject_legal_name, subject_dob, signed_pdf_sha256, scope_description.
 *
 * The PDF itself is uploaded separately to R2 via /api/adult/media/presign
 * (variant='premium' with contentType 'application/pdf' — TODO allow PDFs).
 * We only store the SHA-256 hash here; the storage location of the PDF is
 * not part of this row (admin retrieves it via key derived from creator).
 *
 * Creator MUST be approved.
 * Subject DoB >= 18 at signed_at is enforced by DB CHECK.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";
import { writeAuditFromRequest } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

interface Body {
  subject_legal_name?: string;
  subject_dob?: string;
  signed_pdf_sha256?: string;
  signed_at?: string;
  scope_description?: string;
  subject_user_id?: string | null;
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rows: kyc } = await adultQuery<{ status: string }>(
    `SELECT status FROM adult.creator_kyc WHERE user_id = $1`, [user.userId],
  );
  if (kyc[0]?.status !== "approved") {
    return NextResponse.json({ error: "creator_not_approved" }, { status: 403 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const {
    subject_legal_name, subject_dob, signed_pdf_sha256, signed_at, scope_description, subject_user_id,
  } = body;
  if (!subject_legal_name || !subject_dob || !signed_pdf_sha256 || !signed_at || !scope_description) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/i.test(signed_pdf_sha256)) {
    return NextResponse.json({ error: "bad_sha256" }, { status: 400 });
  }
  const dob = new Date(subject_dob);
  const signedAtDate = new Date(signed_at);
  if (isNaN(dob.getTime()) || isNaN(signedAtDate.getTime())) {
    return NextResponse.json({ error: "bad_date" }, { status: 400 });
  }
  // app-level 18+ check (DB CHECK is the final authority)
  const eighteen = new Date(signedAtDate); eighteen.setFullYear(eighteen.getFullYear() - 18);
  if (dob > eighteen) {
    return NextResponse.json({ error: "subject_underage" }, { status: 400 });
  }

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  const { rows } = await adultQuery<{ id: string }>(
    `INSERT INTO adult.consent_releases
       (creator_user_id, subject_legal_name, subject_dob, subject_user_id,
        signed_pdf_sha256, signed_at, ip_address, scope_description)
     VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8)
     RETURNING id::text`,
    [user.userId, subject_legal_name, subject_dob, subject_user_id ?? null,
     signed_pdf_sha256.toLowerCase(), signed_at, ip, scope_description],
  );

  await writeAuditFromRequest({
    actorUserId: user.userId,
    action: "consent.created",
    targetType: "consent_release",
    targetId: rows[0].id,
    afterState: { subject_legal_name, subject_dob, scope_description },
  }).catch(() => {});

  return NextResponse.json({ id: rows[0].id });
}

export async function GET() {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await adultQuery(
    `SELECT id::text, subject_legal_name, subject_dob,
            signed_at::text, scope_description, revoked_at::text
       FROM adult.consent_releases
      WHERE creator_user_id = $1
      ORDER BY signed_at DESC
      LIMIT 200`,
    [user.userId],
  );
  return NextResponse.json({ items: rows });
}
