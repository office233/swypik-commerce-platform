/**
 * Adult content gate
 *
 * Single source of truth for "should this user see 18+ content?".
 *
 * showAdult=true requires ALL of:
 *   - signed-in user
 *   - users.age_verification_status = 'approved'
 *   - users.adult_content_opt_in = true
 *   - active row in user_age_verifications (status='approved' AND not expired)
 *
 * Use in API routes / server components that fetch products, videos, categories
 * for any public surface. Default behavior (anonymous or unverified) hides 18+.
 */
import { dbQuery } from "@/lib/db";
import type { AuthSession } from "@/lib/auth/session";

export type AdultGate = {
  showAdult: boolean;
  isVerified: boolean;
  optedIn: boolean;
};

const DEFAULT_GATE: AdultGate = { showAdult: false, isVerified: false, optedIn: false };

export async function getAdultGate(input: AuthSession | { userId: string } | string | null | undefined): Promise<AdultGate> {
  const userId = typeof input === "string" ? input : input?.userId;
  if (!userId) return DEFAULT_GATE;

  const { rows } = await dbQuery<{
    age_verification_status: string;
    adult_content_opt_in: boolean;
    has_active_verification: boolean;
  }>(
    `SELECT u.age_verification_status,
            u.adult_content_opt_in,
            EXISTS (
              SELECT 1 FROM user_age_verifications v
              WHERE v.user_id = u.id
                AND v.status = 'approved'
                AND (v.expires_at IS NULL OR v.expires_at > now())
            ) AS has_active_verification
     FROM users u WHERE u.id = $1`,
    [userId]
  );

  const row = rows[0];
  if (!row) return DEFAULT_GATE;

  const isVerified =
    row.age_verification_status === "approved" && row.has_active_verification === true;
  const optedIn = row.adult_content_opt_in === true;

  return {
    showAdult: isVerified && optedIn,
    isVerified,
    optedIn,
  };
}

/**
 * SQL fragment to inline into WHERE clauses.
 * Returns either "TRUE" (no filter, when gate.showAdult) or
 * "<alias>.is_adult = false" (hide adult).
 *
 * Usage:
 *   const adultClause = adultSqlClause(gate, "p");
 *   ... `WHERE p.status = 'active' AND ${adultClause}` ...
 */
export function adultSqlClause(gate: AdultGate, tableAlias: string): string {
  return gate.showAdult ? "TRUE" : `${tableAlias}.is_adult = false`;
}
