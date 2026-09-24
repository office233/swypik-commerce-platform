/**
 * Admin action audit log — records every mutation performed from the admin panel
 * (who, what, on which object, when) into `admin_audit_log`.
 *
 * Non-blocking: a failure to write the log is reported via the logger but never
 * fails the admin action itself.
 */
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export type AdminAuditEntry = {
  /** Dotted verb, e.g. "order.refund", "user.role_change", "video.remove". */
  action: string;
  targetType?: string;
  targetId?: string | number | null;
  /** Small JSON-serialisable context (old/new values, reason). Never secrets. */
  details?: Record<string, unknown>;
  /** The incoming request, used for the client IP. */
  req?: Request;
};

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

export async function logAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    let actorUserId: string | null = null;
    try {
      const user = await getAuthUser();
      if (user.isAdmin && user.userId) actorUserId = user.userId;
    } catch {
      /* admin authenticated via the shared admin secret — no user id */
    }
    await dbQuery(
      `INSERT INTO admin_audit_log (actor_user_id, actor_kind, action, target_type, target_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        actorUserId,
        actorUserId ? "admin_user" : "admin_secret",
        entry.action,
        entry.targetType ?? null,
        entry.targetId == null ? null : String(entry.targetId),
        JSON.stringify(entry.details ?? {}),
        clientIp(entry.req),
      ],
    );
  } catch (err) {
    logger.error({ err, action: entry.action }, "[admin-audit] failed to write audit log");
  }
}
