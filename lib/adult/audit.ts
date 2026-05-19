/**
 * Audit log writer for the Swypik 18+ surface.
 *
 * Every admin action in /adult/admin/* and every state-changing event
 * (KYC decision, payout approval, takedown, etc.) MUST be recorded
 * here. Fail-quietly on DB errors — never block the user action — but
 * log to stderr so the operator sees it.
 */

import { adultQuery } from "./db";
import { currentGeo } from "./geo";

export interface AuditInput {
  actorUserId: string | null;
  action: string;            // "kyc.approve", "post.takedown", "payout.pay", etc.
  targetType: string;        // "post", "creator_kyc", "payout_request", ...
  targetId: string;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await adultQuery(
      `INSERT INTO adult.audit_log
         (actor_user_id, action, target_type, target_id, reason,
          before_state, after_state, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::inet,$9)`,
      [
        input.actorUserId,
        input.action,
        input.targetType,
        input.targetId,
        input.reason ?? null,
        input.beforeState !== undefined ? JSON.stringify(input.beforeState) : null,
        input.afterState !== undefined ? JSON.stringify(input.afterState) : null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
  } catch (err) {
    console.error("[adult-audit] write failed:", (err as Error).message, input);
  }
}

/**
 * Convenience wrapper that pulls IP / UA / geo from the current Next.js
 * request headers. Only use in route handlers / server actions where
 * `headers()` is available.
 */
export async function writeAuditFromRequest(
  base: Omit<AuditInput, "ipAddress" | "userAgent">,
  rawHeaders?: Headers,
): Promise<void> {
  const { headers: nextHeaders } = await import("next/headers");
  const h = rawHeaders ?? (await nextHeaders());
  const xff = h.get("cf-connecting-ip") || h.get("x-forwarded-for") || h.get("x-real-ip");
  const ip = xff ? xff.split(",")[0]?.trim() ?? null : null;
  const ua = h.get("user-agent");
  const geo = await currentGeo();
  await writeAudit({
    ...base,
    ipAddress: ip,
    userAgent: ua,
    afterState: base.afterState !== undefined
      ? { ...(base.afterState as Record<string, unknown>), _geo: geo }
      : base.afterState,
  });
}
