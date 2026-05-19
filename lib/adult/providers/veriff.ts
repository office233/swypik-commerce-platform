/**
 * Veriff KYC adapter.
 *
 * Implements:
 *  - createSession(): POST /v1/sessions → returns hosted URL + session id
 *  - verifyWebhookSignature(): HMAC-SHA256 hex of raw body == X-HMAC-SIGNATURE
 *  - parseDecision(): normalises a webhook payload to { status, sessionId, vendorData }
 *
 * Required env (production):
 *   VERIFF_API_KEY              — X-AUTH-CLIENT header
 *   VERIFF_SHARED_SECRET        — HMAC secret for webhooks AND create-session signature
 *   VERIFF_CALLBACK_URL         — where Veriff redirects the user after flow (e.g. https://18.swypik.com/adult/verify/callback)
 *   VERIFF_WEBHOOK_URL_DECISION — decision webhook URL registered in Veriff Station (https://18.swypik.com/api/adult/webhooks/veriff)
 *
 * Veriff docs:
 *   https://developers.veriff.com/#create-a-new-verification-session
 *   https://developers.veriff.com/#webhook-decision
 */

import crypto from "crypto";

const VERIFF_BASE = process.env.VERIFF_BASE_URL || "https://stationapi.veriff.com";

export function veriffConfigured(): boolean {
  return Boolean(
    process.env.VERIFF_API_KEY &&
    process.env.VERIFF_SHARED_SECRET &&
    process.env.VERIFF_CALLBACK_URL,
  );
}

export interface VeriffSession {
  sessionId: string;
  url: string;
  vendorData: string;
}

interface VeriffCreateResponse {
  status?: string;
  verification?: {
    id: string;
    url: string;
    vendorData?: string;
    sessionToken?: string;
  };
}

export async function createVeriffSession(opts: {
  userId: string;
  callbackUrl?: string;
}): Promise<VeriffSession> {
  const apiKey = process.env.VERIFF_API_KEY!;
  const callback = opts.callbackUrl || process.env.VERIFF_CALLBACK_URL!;

  const body = {
    verification: {
      callback,
      vendorData: opts.userId,
      timestamp: new Date().toISOString(),
    },
  };

  const res = await fetch(`${VERIFF_BASE}/v1/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-auth-client": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Veriff create-session failed: ${res.status} ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as VeriffCreateResponse;
  if (!data.verification?.id || !data.verification?.url) {
    throw new Error(`Veriff response missing verification.{id,url}: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return {
    sessionId: data.verification.id,
    url: data.verification.url,
    vendorData: data.verification.vendorData || opts.userId,
  };
}

/**
 * Verify the X-HMAC-SIGNATURE header against the raw request body using
 * timing-safe comparison. Returns true on match.
 */
export function verifyVeriffSignature(rawBody: string, signatureHex: string | null): boolean {
  if (!signatureHex) return false;
  const secret = process.env.VERIFF_SHARED_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try {
    b = Buffer.from(signatureHex, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type VeriffDecisionStatus = "approved" | "declined" | "resubmission_requested" | "expired" | "abandoned" | "review";

export interface VeriffDecision {
  sessionId: string;
  vendorData: string | null;
  status: VeriffDecisionStatus;
  rejectionReason: string | null;
  raw: unknown;
}

interface VeriffWebhookPayload {
  status?: string;
  verification?: {
    id?: string;
    vendorData?: string;
    status?: string;
    code?: number;
    reason?: string;
    reasonCode?: number | string;
  };
}

const STATUS_MAP: Record<string, VeriffDecisionStatus> = {
  approved: "approved",
  declined: "declined",
  resubmission_requested: "resubmission_requested",
  expired: "expired",
  abandoned: "abandoned",
  review: "review",
};

export function parseVeriffDecision(payload: unknown): VeriffDecision | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as VeriffWebhookPayload;
  const v = p.verification;
  if (!v?.id || !v.status) return null;
  const status = STATUS_MAP[v.status];
  if (!status) return null;
  return {
    sessionId: v.id,
    vendorData: v.vendorData || null,
    status,
    rejectionReason: v.reason || (v.reasonCode != null ? String(v.reasonCode) : null),
    raw: payload,
  };
}
