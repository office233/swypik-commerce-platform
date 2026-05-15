"use client";

import { useEffect, useState } from "react";
import { isEnabledClient } from "@/lib/feature-flags-client";

type Status = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue?: string[];
};

export default function StripeConnectCard({ variant = "creator" }: { variant?: "creator" | "seller" }) {
  if (!isEnabledClient("stripeConnect")) return null;
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stripe-connect/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setError("Eroare la verificarea statusului."))
      .finally(() => setLoading(false));
  }, []);

  async function startOnboarding() {
    setConnecting(true);
    setError(null);
    try {
      const r = await fetch("/api/stripe-connect/onboarding/start", { method: "POST" });
      const j = await r.json();
      if (j.url) {
        window.location.href = j.url;
        return;
      }
      setError(j.error || "Eroare la conectare.");
    } catch {
      setError("Eroare de rețea.");
    } finally {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#E5E5E5] bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <p className="text-sm text-[#6E6E80] dark:text-white/60">Se verifică statusul Stripe...</p>
      </div>
    );
  }

  if (!status) return null;

  const connected = !!status.accountId;
  const verified = connected && status.chargesEnabled && status.payoutsEnabled;
  const pending = connected && !verified;

  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-[#0D0D0D] dark:text-white">
            {verified ? "Stripe Connect activ" : pending ? "Stripe — finalizează verificarea" : "Conectează Stripe pentru a primi plăți"}
          </h3>
          <p className="mt-1 text-sm text-[#6E6E80] dark:text-white/60">
            {verified
              ? "Plățile și payout-urile sunt active. Poți primi comisioane."
              : pending
              ? "Stripe are nevoie de informații suplimentare pentru a activa payout-urile."
              : `Conectează un cont Stripe pentru a primi banii din ${variant === "seller" ? "vânzări" : "comisioane creator"}.`}
          </p>
          {pending && status.requirementsCurrentlyDue && status.requirementsCurrentlyDue.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-[#7C3AED]">
              {status.requirementsCurrentlyDue.slice(0, 3).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            verified
              ? "bg-[#10A37F]/15 text-[#10A37F]"
              : pending
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
              : "bg-[#7C3AED]/15 text-[#7C3AED]"
          }`}
        >
          {verified ? "VERIFICAT" : pending ? "ÎN AȘTEPTARE" : "NECONECTAT"}
        </span>
      </div>

      {error && <p className="mt-3 text-xs font-medium text-[#7C3AED]">{error}</p>}

      {!verified && (
        <button
          type="button"
          onClick={startOnboarding}
          disabled={connecting}
          className="mt-4 w-full rounded-xl bg-[#635BFF] py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50 hover:bg-[#5048E5] sm:w-auto sm:px-6"
        >
          {connecting ? "Se redirecționează..." : connected ? "Continuă verificarea" : "Conectează Stripe"}
        </button>
      )}
    </div>
  );
}
