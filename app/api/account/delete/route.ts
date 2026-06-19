/**
 * POST   /api/account/delete         — request account deletion
 * DELETE /api/account/delete         — cancel pending deletion (grace period)
 *
 * GDPR Art. 17 — Right to Erasure.
 *
 * Soft-delete pattern with a 30-day grace period:
 *   - Day 0:  user clicks "delete account"
 *             → users.deletion_requested_at = now()
 *             → users.deletion_scheduled_at = now() + 30 days
 *             → all sessions revoked (user is logged out immediately)
 *             → email is replaced with a placeholder + random hash so the
 *               original address can be reused for a new signup right away
 *               (privacy + practical: their @example.com is now theirs again)
 *             → username is replaced with deleted_<short_hash>
 *   - Day 0..30: user can POST DELETE /api/account/delete to cancel
 *               (if they log in again somehow — we keep auth_accounts row).
 *   - Day 30+: a cron worker (scripts/gdpr-hard-delete.mjs, to be added)
 *              hard-deletes the row, which cascades FK deletes set to
 *              ON DELETE CASCADE; FKs without CASCADE need explicit handling
 *              in that script.
 *
 * Why we anonymize email/username on Day 0 instead of waiting 30 days:
 *   - Holding identifiable data longer than necessary is itself a GDPR
 *     violation if the user has clearly withdrawn consent.
 *   - Users want to re-register with the same email immediately.
 *   - The 30-day window is for *recoverability of activity history*, not
 *     for keeping the identity around.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = logger.child({ route: "account/delete" });

/**
 * Rate limit: 3 requests / hour / IP, shared between POST and DELETE.
 * Why so tight: deletion is a destructive, high-stakes operation. A normal
 * user clicks once, maybe twice if they mis-typed the confirm string.
 * Anything beyond that is almost certainly automated abuse (mass-delete
 * via a compromised token, or social-engineering exfiltration).
 */
async function enforceRateLimit(req: Request): Promise<NextResponse | null> {
  const ip = getClientIP(req);
  const { success, remaining } = await rateLimit("accountDelete", ip);
  if (!success) {
    log.warn({ ip }, "account_delete_rate_limited");
    return NextResponse.json(
      { error: "Too many deletion attempts. Please try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } },
    );
  }
  return null;
}

const SHOPPER_COOKIE = "swypik_session";
const GRACE_PERIOD_DAYS = 30;

function randomHash(): string {
  return crypto.randomBytes(8).toString("hex");
}

async function logAudit(
  userId: string,
  type: "delete" | "delete_cancel",
  req: Request,
  meta: Record<string, unknown> = {},
) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || null;
  const ua = req.headers.get("user-agent") || null;
  try {
    await dbQuery(
      `INSERT INTO gdpr_requests (user_id, request_type, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, ip, ua, JSON.stringify(meta)],
    );
  } catch (err) {
    log.warn({ err: String(err), userId, type }, "audit_log_failed");
  }
}

export async function POST(req: Request) {
  const rl = await enforceRateLimit(req);
  if (rl) return rl;

  const auth = await getAuthUser();
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = auth.userId;

  // Idempotency: if deletion is already requested and not yet executed,
  // return current state instead of double-flagging.
  const { rows: existing } = await dbQuery<{ deletion_requested_at: Date | null; deletion_scheduled_at: Date | null; deleted_at: Date | null }>(
    `SELECT deletion_requested_at, deletion_scheduled_at, deleted_at
       FROM users WHERE id = $1`,
    [userId],
  );
  const row = existing[0];
  if (!row) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (row.deleted_at) {
    return NextResponse.json({ error: "Account already deleted" }, { status: 410 });
  }
  if (row.deletion_requested_at && row.deletion_scheduled_at) {
    return NextResponse.json(
      {
        ok: true,
        already_pending: true,
        deletion_requested_at: row.deletion_requested_at,
        deletion_scheduled_at: row.deletion_scheduled_at,
        grace_period_days: GRACE_PERIOD_DAYS,
      },
      { status: 200 },
    );
  }

  // Mark for deletion + anonymize identity in a single transaction.
  // Wrapping is important: we must not leave a half-anonymized row if the
  // session revoke or audit log fails afterwards.
  const placeholderEmail = `deleted-${randomHash()}@deleted.swypik.local`;
  const placeholderUsername = `deleted_${randomHash()}`;

  try {
    await dbQuery("BEGIN");
    await dbQuery(
      `UPDATE users
          SET deletion_requested_at = now(),
              deletion_scheduled_at = now() + interval '${GRACE_PERIOD_DAYS} days',
              email                 = $2,
              username              = $3,
              display_name          = NULL,
              avatar_url            = NULL,
              bio                   = NULL,
              birth_date            = NULL,
              status                = 'deleted',
              updated_at            = now()
        WHERE id = $1`,
      [userId, placeholderEmail, placeholderUsername],
    );
    // Revoke all active sessions immediately so the user is logged out
    // everywhere and the cookie they currently hold becomes useless.
    await dbQuery(
      `UPDATE user_sessions
          SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await dbQuery("COMMIT");
  } catch (err) {
    await dbQuery("ROLLBACK").catch(() => {});
    log.error({ err: String(err), userId }, "deletion_request_failed");
    return NextResponse.json({ error: "Deletion request failed" }, { status: 500 });
  }

  await logAudit(userId, "delete", req, { grace_period_days: GRACE_PERIOD_DAYS });

  // Clear the session cookie so the browser tab is no longer authenticated.
  // Mirror the cookie-set pattern in /api/auth so the clear actually targets
  // the same domain attribute (otherwise the browser keeps the old cookie).
  const isProd = process.env.NODE_ENV === "production";
  const secureFlag = isProd ? "; Secure" : "";
  const domainFlag = isProd ? "; Domain=swypik.com" : "";
  const res = NextResponse.json(
    {
      ok: true,
      deletion_scheduled_in_days: GRACE_PERIOD_DAYS,
      message:
        "Your account has been marked for deletion. " +
        "All data will be permanently erased in " +
        GRACE_PERIOD_DAYS +
        " days. You have been logged out.",
    },
    { status: 200 },
  );
  res.headers.append(
    "Set-Cookie",
    `${SHOPPER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}${domainFlag}`,
  );
  return res;
}

export async function DELETE(req: Request) {
  const rl = await enforceRateLimit(req);
  if (rl) return rl;

  // Cancel a pending deletion.
  // Note: by this point the user has been logged out (POST revoked sessions).
  // They need to log in again first; this endpoint is only reachable with
  // a valid session, which means they recovered access (which is fine —
  // proves they still own the account). At that point we restore the
  // status field but cannot un-anonymize email/username (the original
  // values were never stored anywhere else; that's intentional for privacy).
  const auth = await getAuthUser();
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = auth.userId;

  const { rowCount } = await dbQuery(
    `UPDATE users
        SET deletion_requested_at = NULL,
            deletion_scheduled_at = NULL,
            status                = 'active',
            updated_at            = now()
      WHERE id = $1
        AND deletion_requested_at IS NOT NULL
        AND deleted_at IS NULL`,
    [userId],
  );

  if (rowCount === 0) {
    return NextResponse.json({ error: "No pending deletion to cancel" }, { status: 404 });
  }

  await logAudit(userId, "delete_cancel", req);

  return NextResponse.json({
    ok: true,
    message:
      "Deletion cancelled. Note: your previous email and display name " +
      "were anonymized when deletion was requested and cannot be restored. " +
      "Please update your profile from /account/edit.",
  });
}
