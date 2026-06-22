"use client";

/**
 * Pi payment client helper (U2A — User pays the App).
 *
 * Wraps window.Pi.createPayment and wires its callbacks to our server
 * endpoints:
 *   onReadyForServerApproval(paymentId)  -> POST /api/payments/pi/approve
 *   onReadyForServerCompletion(id, txid) -> POST /api/payments/pi/complete
 *   onCancel(paymentId)                  -> POST /api/payments/pi/cancel
 *   onError(error, payment)              -> best-effort cancel + surface error
 *
 * Also exposes ensurePiAuthWithPayments() which authenticates with the
 * "payments" scope (required before createPayment) and replays any
 * incomplete payment via onIncompletePaymentFound.
 *
 * Docs: https://github.com/pi-apps/pi-platform-docs/blob/master/payments.md
 */

import type { PiAuthResult, PiSDK, PiIncompletePayment } from "@/lib/pi/types";

function getPi(): PiSDK {
  if (typeof window === "undefined" || !window.Pi) {
    throw new Error("Pi SDK not available (open in Pi Browser)");
  }
  return window.Pi;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Replays an incomplete payment found at auth time: completes it server-side
 * so the user isn't blocked from starting a new one. Pi only allows one
 * pending payment per user at a time.
 */
async function handleIncompletePayment(payment: PiIncompletePayment): Promise<void> {
  const txid = payment.transaction?.txid;
  if (txid) {
    await postJson("/api/payments/pi/complete", {
      paymentId: payment.identifier,
      txid,
    }).catch(() => {});
  } else {
    await postJson("/api/payments/pi/cancel", {
      paymentId: payment.identifier,
    }).catch(() => {});
  }
}

/** Authenticate with the payments scope. Call before createPiPayment. */
export async function ensurePiAuthWithPayments(): Promise<PiAuthResult> {
  const Pi = getPi();
  return Pi.authenticate(["username", "payments"], handleIncompletePayment);
}

export type CreatePiPaymentArgs = {
  amountPi: number;
  memo: string;
  // The cart the server will re-price authoritatively at approval time.
  items: Array<{ productId: string; quantity: number; skuId?: string }>;
  onApproved?: () => void;
  onCompleted?: (orderId: string) => void;
  onCancelled?: () => void;
  onError?: (message: string) => void;
};

/**
 * Starts a Pi payment. Resolves when the SDK has accepted the createPayment
 * call; the real outcome is delivered through the callbacks (onCompleted etc).
 */
export function createPiPayment(args: CreatePiPaymentArgs): void {
  const Pi = getPi();

  Pi.createPayment(
    {
      amount: args.amountPi,
      memo: args.memo,
      metadata: { kind: "swypik_order", items: args.items },
    },
    {
      onReadyForServerApproval: async (paymentId: string) => {
        try {
          const res = await postJson("/api/payments/pi/approve", {
            paymentId,
            items: args.items,
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            args.onError?.(j?.error || "Approval failed");
            await postJson("/api/payments/pi/cancel", { paymentId }).catch(() => {});
            return;
          }
          args.onApproved?.();
        } catch {
          args.onError?.("Network error during approval");
        }
      },
      onReadyForServerCompletion: async (paymentId: string, txid: string) => {
        try {
          const res = await postJson("/api/payments/pi/complete", { paymentId, txid });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) {
            args.onError?.(j?.error || "Completion failed");
            return;
          }
          args.onCompleted?.(j.orderId);
        } catch {
          args.onError?.("Network error during completion");
        }
      },
      onCancel: async (paymentId: string) => {
        await postJson("/api/payments/pi/cancel", { paymentId }).catch(() => {});
        args.onCancelled?.();
      },
      onError: async (error: Error, payment?: { identifier?: string }) => {
        if (payment?.identifier) {
          await postJson("/api/payments/pi/cancel", { paymentId: payment.identifier }).catch(() => {});
        }
        args.onError?.(error?.message || "Payment error");
      },
    },
  );
}
