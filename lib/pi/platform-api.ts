/**
 * Pi Platform API client (server-side only).
 *
 * Wraps the Pi Server API at api.minepi.com/v2 used for:
 *   - GET  /me                              (verify access token)
 *   - GET  /payments/{paymentId}            (fetch payment status)
 *   - POST /payments/{paymentId}/approve    (server-side approval)
 *   - POST /payments/{paymentId}/complete   (server-side completion)
 *   - POST /payments/{paymentId}/cancel     (server-side cancel)
 *
 * Auth: all payment endpoints require the app's Server API Key, sent as
 *   Authorization: Key <PI_API_KEY>
 * The /me endpoint instead uses the user's access token:
 *   Authorization: Bearer <accessToken>
 *
 * Docs: https://github.com/pi-apps/pi-platform-docs
 */

import { logger } from "@/lib/logger";

const log = logger.child({ service: "pi-platform-api" });

const BASE_URL = process.env.PI_API_BASE_URL || "https://api.minepi.com/v2";
const API_KEY = process.env.PI_API_KEY || "";

const TIMEOUT_MS = 10_000;

export type PiPaymentDTO = {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  to_address: string;
  created_at: string;
  network: string;
  status: {
    developer_approved: boolean;
    transaction_verified: boolean;
    developer_completed: boolean;
    cancelled: boolean;
    user_cancelled: boolean;
  };
  transaction: null | {
    txid: string;
    verified: boolean;
    _link: string;
  };
};

export type PiMeDTO = {
  uid: string;
  username: string;
};

function ensureConfigured(): string {
  if (!API_KEY) {
    throw new Error("PI_API_KEY is not configured");
  }
  return API_KEY;
}

async function piFetch<T>(
  path: string,
  opts: { method?: string; auth: string; body?: unknown } ,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method || "GET",
      headers: {
        Authorization: opts.auth,
        "Content-Type": "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      log.warn({ path, status: res.status, body: text.slice(0, 300) }, "pi api non-2xx");
      throw new PiApiError(res.status, text.slice(0, 300), json);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export class PiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
    public readonly bodyJson: unknown = null,
  ) {
    super(`Pi API error ${status}: ${bodyText}`);
    this.name = "PiApiError";
  }
}

/** Verify a user access token by reading their profile. */
export async function getPiMe(accessToken: string): Promise<PiMeDTO> {
  return piFetch<PiMeDTO>("/me", { auth: `Bearer ${accessToken}` });
}

/** Fetch the current server-side state of a payment. */
export async function getPiPayment(paymentId: string): Promise<PiPaymentDTO> {
  ensureConfigured();
  return piFetch<PiPaymentDTO>(`/payments/${encodeURIComponent(paymentId)}`, {
    auth: `Key ${API_KEY}`,
  });
}

/** Approve a payment (phase 1 server-side). */
export async function approvePiPayment(paymentId: string): Promise<PiPaymentDTO> {
  ensureConfigured();
  return piFetch<PiPaymentDTO>(`/payments/${encodeURIComponent(paymentId)}/approve`, {
    method: "POST",
    auth: `Key ${API_KEY}`,
  });
}

/** Complete a payment (phase 2 server-side) with the on-chain txid. */
export async function completePiPayment(paymentId: string, txid: string): Promise<PiPaymentDTO> {
  ensureConfigured();
  return piFetch<PiPaymentDTO>(`/payments/${encodeURIComponent(paymentId)}/complete`, {
    method: "POST",
    auth: `Key ${API_KEY}`,
    body: { txid },
  });
}

/** Cancel a payment server-side. */
export async function cancelPiPayment(paymentId: string): Promise<PiPaymentDTO> {
  ensureConfigured();
  return piFetch<PiPaymentDTO>(`/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: "POST",
    auth: `Key ${API_KEY}`,
  });
}

export function isPiConfigured(): boolean {
  return Boolean(API_KEY);
}
