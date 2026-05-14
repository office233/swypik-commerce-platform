/**
 * GET /api/age-verification/status
 *
 * Returns the current age-verification + opt-in state for the signed-in user.
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Row = {
  age_verification_status: string;
  age_verified_at: string | null;
  birth_date: string | null;
  adult_content_opt_in: boolean;
  verification_status: string | null;
  verified_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
};

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rows } = await dbQuery<Row>(
      `SELECT u.age_verification_status,
              u.age_verified_at,
              u.birth_date,
              u.adult_content_opt_in,
              v.status AS verification_status,
              v.verified_at,
              v.expires_at,
              v.rejection_reason
         FROM users u
         LEFT JOIN user_age_verifications v ON v.user_id = u.id
        WHERE u.id = $1`,
      [session.userId]
    );

    const row = rows[0];
    if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      status: row.age_verification_status,
      verifiedAt: row.age_verified_at,
      birthDate: row.birth_date,
      adultOptIn: row.adult_content_opt_in,
      verification: {
        status: row.verification_status,
        verifiedAt: row.verified_at,
        expiresAt: row.expires_at,
        rejectionReason: row.rejection_reason,
      },
    });
  } catch (err: any) {
    console.error("[age-verification/status]", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
