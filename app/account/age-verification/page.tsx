import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import AgeVerificationClient from "./AgeVerificationClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificare vârstă — Swypik",
};

type Row = {
  age_verification_status: "none" | "pending" | "approved" | "rejected" | "expired";
  age_verified_at: string | null;
  birth_date: string | null;
  adult_content_opt_in: boolean;
  rejection_reason: string | null;
  expires_at: string | null;
};

export default async function AgeVerificationPage() {
  const session = await getAuthSession();
  if (!session?.userId) {
    redirect("/auth/login?next=/account/age-verification");
  }

  const { rows } = await dbQuery<Row>(
    `SELECT u.age_verification_status,
            u.age_verified_at,
            u.birth_date,
            u.adult_content_opt_in,
            v.rejection_reason,
            v.expires_at
       FROM users u
       LEFT JOIN user_age_verifications v ON v.user_id = u.id
      WHERE u.id = $1`,
    [session.userId]
  );

  const row = rows[0];

  return (
    <AgeVerificationClient
      initialState={{
        status: row?.age_verification_status ?? "none",
        verifiedAt: row?.age_verified_at ?? null,
        birthDate: row?.birth_date ?? null,
        optIn: Boolean(row?.adult_content_opt_in),
        rejectionReason: row?.rejection_reason ?? null,
        expiresAt: row?.expires_at ?? null,
      }}
    />
  );
}
