/**
 * Swypik 18+ access gate.
 *
 * Single source of truth for whether the current request may render
 * adult content. ALL /adult/* routes MUST call requireAdultAccess()
 * before returning content; failure returns a redirect-suggestion the
 * caller serialises as 401/403 or as a Next redirect.
 *
 * HARD RULES (enforced here AND in DB):
 *   - The user must be authenticated.
 *   - adult.access_grants.viewer_verified must be TRUE.
 *   - The grant must not be expired (expires_at IS NULL OR > now()).
 *   - The grant must not be soft-blocked (blocked_reason IS NULL).
 *
 * For creator-only routes (publish, KYC, payouts) ALSO require
 * adult.creator_kyc.status='approved'.
 *
 * IMPORTANT: this module uses the ISOLATED adult DB pool (`adultQuery`).
 * It must NEVER import `dbQuery` from `@/lib/db` — the swypik DB is a
 * different physical database.
 */

import { adultQuery } from "./db";
import { upsertUserMirror } from "./userMirror";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export type AdultAccess =
  | { ok: true; userId: string; creatorApproved: boolean }
  | { ok: false; reason: "unauthenticated" | "not_verified" | "expired" | "blocked"; redirectTo: string };

/**
 * Lookup current access state. Read-only, safe to call from RSC.
 */
export async function getAdultAccess(): Promise<AdultAccess> {
  const user = await getAuthUser();
  if (!user.userId) {
    return { ok: false, reason: "unauthenticated", redirectTo: "/account?redirect=/adult" };
  }

  try {
    const { rows } = await adultQuery<{
      viewer_verified: boolean;
      expires_at: string | null;
      blocked_reason: string | null;
      creator_status: string | null;
    }>(
      `SELECT COALESCE(ag.viewer_verified, FALSE) AS viewer_verified,
              ag.expires_at,
              ag.blocked_reason,
              kyc.status AS creator_status
         FROM (SELECT $1::uuid AS uid) u
         LEFT JOIN adult.access_grants ag ON ag.user_id = u.uid
         LEFT JOIN adult.creator_kyc kyc ON kyc.user_id = u.uid`,
      [user.userId],
    );

    const row = rows[0] ?? {
      viewer_verified: false,
      expires_at: null,
      blocked_reason: null,
      creator_status: null,
    };

    if (row.blocked_reason) return { ok: false, reason: "blocked", redirectTo: "/adult/blocked" };
    if (!row.viewer_verified) return { ok: false, reason: "not_verified", redirectTo: "/adult/verify" };
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return { ok: false, reason: "expired", redirectTo: "/adult/verify" };
    }

    // Lazy mirror — fire-and-forget; never blocks access.
    void upsertUserMirror({ userId: user.userId, email: user.email, role: user.role });

    return {
      ok: true,
      userId: user.userId,
      creatorApproved: row.creator_status === "approved",
    };
  } catch (err) {
    // If the adult schema isn't deployed yet (or any DB hiccup), fail closed.
    console.warn("[adult-gate] failing closed:", (err as Error).message);
    return { ok: false, reason: "not_verified", redirectTo: "/adult/verify" };
  }
}

/**
 * Throw-like helper for API routes. Caller should return early with
 * the suggested status code.
 */
export async function requireAdultAccess(): Promise<AdultAccess> {
  return getAdultAccess();
}
