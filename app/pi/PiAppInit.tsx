"use client";

import { useEffect, useState } from "react";
import { CLIENT_FEATURES } from "@/lib/feature-flags-client";
import type { PiSDK, PiIncompletePayment } from "@/lib/pi/types";

/**
 * Initializes the Pi SDK and auto-authenticates the Pioneer on load.
 *
 * Flow (per Pi SDK docs):
 *   1. wait for window.Pi to exist
 *   2. await Pi.init({ version: "2.0", sandbox }) FULLY
 *   3. Pi.authenticate(["username"], onIncompletePayment)
 *   4. POST the accessToken to /api/auth/pi which verifies it via
 *      GET https://api.minepi.com/v2/me (no API key needed) and sets a
 *      session cookie.
 *
 * Renders a tiny status line only while connecting / on error, so the shell
 * is usable but the user knows auth state. A manual retry button shows if
 * auto-auth was cancelled.
 */

async function replayIncomplete(payment: PiIncompletePayment) {
  const txid = payment.transaction?.txid;
  const endpoint = txid ? "/api/payments/pi/complete" : "/api/payments/pi/cancel";
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(txid ? { paymentId: payment.identifier, txid } : { paymentId: payment.identifier }),
  }).catch(() => {});
}

export default function PiAppInit() {
  const [state, setState] = useState<"init" | "ok" | "cancelled" | "error" | "no-pi">("init");

  async function run() {
    setState("init");
    const Pi = (window as unknown as { Pi?: PiSDK }).Pi;
    if (!Pi) {
      setState("no-pi");
      return;
    }
    try {
      await Promise.resolve(Pi.init({ version: "2.0", sandbox: CLIENT_FEATURES.piSandbox }));
    } catch {
      /* init may resolve void; continue */
    }
    try {
      const auth = await Pi.authenticate(["username"], replayIncomplete);
      const res = await fetch("/api/auth/pi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: auth.accessToken, user: auth.user }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("ok");
    } catch {
      setState("cancelled");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const tryStart = (attempt: number) => {
      if (cancelled) return;
      const hasPi = !!(window as unknown as { Pi?: unknown }).Pi;
      if (hasPi) {
        void run();
        return;
      }
      if (attempt < 40) setTimeout(() => tryStart(attempt + 1), 150);
      else setState("no-pi");
    };
    tryStart(0);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "ok" || state === "init") return null;

  return (
    <div className="mx-auto max-w-screen-sm px-4 pt-2">
      <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 flex items-center justify-between">
        <span>
          {state === "no-pi"
            ? "Open in Pi Browser to sign in and pay with Pi."
            : state === "error"
            ? "Sign-in failed. Tap retry."
            : "Sign in with Pi to buy."}
        </span>
        {state !== "no-pi" && (
          <button
            onClick={() => void run()}
            className="ml-3 rounded-md bg-[#7D4698] px-3 py-1 font-bold text-white"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
