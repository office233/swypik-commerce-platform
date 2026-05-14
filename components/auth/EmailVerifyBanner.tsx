"use client";

import { useEffect, useState } from "react";
import { Mail, X, Loader2 } from "lucide-react";

type AuthInfo = {
  authenticated: boolean;
  customer?: {
    email?: string;
    emailVerified?: boolean;
    suspendGraceUntil?: string | null;
  };
};

export default function EmailVerifyBanner() {
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.sessionStorage.getItem("swypik_dismissed_verify") === "1");
    fetch("/api/auth", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setInfo(j))
      .catch(() => {});
  }, []);

  if (!info?.authenticated || !info.customer) return null;
  if (info.customer.emailVerified) return null;
  if (dismissed) return null;

  const daysLeft = (() => {
    if (!info.customer.suspendGraceUntil) return null;
    const ms = new Date(info.customer.suspendGraceUntil).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  })();

  async function resend() {
    if (!info?.customer?.email) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_otp", email: info.customer.email }),
      });
      const j = await res.json();
      if (res.ok && j.requiresVerification) {
        setSent(true);
        setTimeout(() => setSent(false), 5000);
      }
    } finally {
      setSending(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("swypik_dismissed_verify", "1");
    }
  }

  return (
    <div className="sticky top-12 z-30 border-b border-yellow-500/30 bg-yellow-500/10 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-3 py-2 text-xs text-yellow-100">
        <Mail className="h-4 w-4 flex-shrink-0 text-yellow-300" />
        <p className="flex-1 leading-snug">
          {sent ? (
            <>Cod nou trimis pe <b>{info.customer.email}</b>. Verifică inbox-ul.</>
          ) : daysLeft !== null && daysLeft <= 7 ? (
            <>
              Verifică emailul în <b>{daysLeft} {daysLeft === 1 ? "zi" : "zile"}</b> ca să nu pierzi accesul.
            </>
          ) : (
            <>Confirmă emailul ca să activezi tot contul.</>
          )}
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={sending || sent}
          className="rounded-lg bg-yellow-500/20 px-2 py-1 font-bold text-yellow-100 hover:bg-yellow-500/30 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : sent ? "Trimis ✓" : "Retrimite"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Închide"
          className="rounded-lg p-1 text-yellow-100/70 hover:bg-yellow-500/20 hover:text-yellow-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
