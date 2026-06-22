"use client";

/**
 * "Pay with Pi" button — shown ONLY inside the Pi Browser, alongside the
 * normal (Stripe) checkout button on the main swypik.com site.
 *
 * This is how Swypik supports BOTH payment rails on a single URL:
 *   - normal web / PiNet visitor -> sees Stripe checkout (fiat)
 *   - Pi Browser visitor         -> ALSO sees this Pi payment option
 *
 * Per Pi docs, PiNet (web) visitors can browse; the Pi SDK only works inside
 * the Pi Browser, so this button auto-hides everywhere else and never breaks
 * the fiat flow.
 */

import { useEffect, useState } from "react";
import { ensurePiAuthWithPayments, createPiPayment } from "@/lib/pi/payments";

type Props = {
  items: Array<{
    productId: string;
    quantity: number;
    skuId?: string;
    videoId?: string;
    creatorId?: string;
    creatorProductLinkId?: string;
  }>;
  // Display amount in Pi (already converted). If null we fetch a fresh quote.
  amountPi: number | null;
  title: string;
  className?: string;
  onPaid?: (orderId: string) => void;
};

function isPiBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /PiBrowser/i.test(navigator.userAgent);
}

export default function PayWithPiButton({ items, amountPi, title, className, onPaid }: Props) {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<
    | { phase: "idle" }
    | { phase: "auth" }
    | { phase: "paying" }
    | { phase: "done"; orderId: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  useEffect(() => {
    // Show in Pi Browser, or when sandbox is on (for testing on desktop).
    const sandbox = process.env.NEXT_PUBLIC_PI_SANDBOX === "1";
    setShow(sandbox || isPiBrowser());
  }, []);

  if (!show) return null;

  async function pay() {
    if (!amountPi || amountPi <= 0) {
      setStatus({ phase: "error", message: "Pi price unavailable right now." });
      return;
    }
    setStatus({ phase: "auth" });
    try {
      await ensurePiAuthWithPayments();
    } catch (e) {
      setStatus({
        phase: "error",
        message: e instanceof Error ? e.message : "Open in Pi Browser to pay with Pi.",
      });
      return;
    }
    setStatus({ phase: "paying" });
    createPiPayment({
      amountPi,
      memo: `Swypik — ${title}`.slice(0, 120),
      items,
      onCompleted: (orderId) => {
        setStatus({ phase: "done", orderId });
        onPaid?.(orderId);
      },
      onCancelled: () => setStatus({ phase: "idle" }),
      onError: (message) => setStatus({ phase: "error", message }),
    });
  }

  if (status.phase === "done") {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-center text-sm font-bold text-green-700 dark:text-green-300">
        ✅ Paid with Pi — order {status.orderId.slice(0, 8)}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={pay}
        disabled={status.phase === "auth" || status.phase === "paying"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7D4698] py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        <span className="text-base">π</span>
        {status.phase === "auth"
          ? "Connecting to Pi…"
          : status.phase === "paying"
          ? "Paying…"
          : amountPi
          ? `Pay with Pi (π ${amountPi.toFixed(4)})`
          : "Pay with Pi"}
      </button>
      {status.phase === "error" && (
        <p className="mt-2 text-center text-xs text-red-500">{status.message}</p>
      )}
    </div>
  );
}
