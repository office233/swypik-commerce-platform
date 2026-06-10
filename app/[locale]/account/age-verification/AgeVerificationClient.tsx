"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDate } from "@/lib/i18n/date";

type Status = "none" | "pending" | "approved" | "rejected" | "expired";

type Props = {
  initialState: {
    status: Status;
    verifiedAt: string | null;
    birthDate: string | null;
    optIn: boolean;
    rejectionReason: string | null;
    expiresAt: string | null;
  };
};

const STATUS_COLOR: Record<Status, string> = {
  none: "bg-white/10 text-white",
  pending: "bg-yellow-500/20 text-yellow-300",
  approved: "bg-green-500/20 text-green-300",
  rejected: "bg-red-500/20 text-red-300",
  expired: "bg-orange-500/20 text-orange-300",
};

export default function AgeVerificationClient({ initialState }: Props) {
  const t = useTranslations("ageverificationAgeVerification");
  const locale = useLocale();
  const [state, setState] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [optInLoading, setOptInLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const STATUS_LABEL: Record<Status, string> = {
    none: t("statusNeverificat"),
    pending: t("statusPending"),
    approved: t("statusVerificat"),
    rejected: t("statusRespins"),
    expired: t("statusExpirat"),
  };

  async function startVerification() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/age-verification/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("errStart"));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setState((s) => ({ ...s, status: "pending" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errNecunoscuta"));
    } finally {
      setLoading(false);
    }
  }

  async function toggleOptIn(next: boolean) {
    setOptInLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/age-verification/opt-in", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("errOptIn"));
      setState((s) => ({ ...s, optIn: data.optIn }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errNecunoscuta"));
    } finally {
      setOptInLoading(false);
    }
  }

  const isApproved = state.status === "approved";
  const ctaLabel =
    state.status === "approved"
      ? t("ctaReverifica")
      : state.status === "pending"
        ? t("ctaReia")
        : t("ctaVerifica");

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white pb-24">
      <header className="sticky top-0 z-30 bg-[#0D0D0D]/90 backdrop-blur-md border-b border-white/10 px-4 py-4">
        <h1 className="text-lg font-bold">{t("verificareVarsta")}</h1>
        <p className="text-sm text-white/60 mt-0.5">
          
          {t("necesarPentruAAccesa")}
        </p>
      </header>

      <main className="px-4 pt-6 max-w-xl mx-auto space-y-6">
        <section className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-white/60">{t("statusCurent")}</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[state.status]}`}>
              {STATUS_LABEL[state.status]}
            </span>
          </div>

          {state.verifiedAt && (
            <p className="text-sm text-white/70 mb-2">
              
              {t("verificatLa")} <span className="text-white">{formatDate(state.verifiedAt, locale)}</span>
            </p>
          )}
          {state.birthDate && (
            <p className="text-sm text-white/70 mb-2">
              
              {t("dataNasterii")} <span className="text-white">{formatDate(state.birthDate, locale)}</span>
            </p>
          )}
          {state.expiresAt && (
            <p className="text-sm text-white/70 mb-2">
              
              {t("expiraLa")} <span className="text-white">{formatDate(state.expiresAt, locale)}</span>
            </p>
          )}
          {state.rejectionReason && state.status === "rejected" && (
            <p className="text-sm text-red-300 mb-2">
              {t("motivRespingere", { reason: state.rejectionReason })}
            </p>
          )}

          <button
            onClick={startVerification}
            disabled={loading}
            className="w-full mt-2 bg-[#7C3AED] hover:bg-[#E0264A] disabled:opacity-50 text-white py-3 rounded-lg font-bold transition"
          >
            {loading ? t("btnSePregateste") : ctaLabel}
          </button>

          <p className="text-xs text-white/50 mt-3 leading-relaxed">
            
            {t("folosimStripeIdentityPentru")}
          </p>
        </section>

        {isApproved && (
          <section className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-bold mb-1">{t("afiseazaContinut18")}</h2>
                <p className="text-sm text-white/60">
                  
                  {t("activeazaPentruAVedea")}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={state.optIn}
                onClick={() => toggleOptIn(!state.optIn)}
                disabled={optInLoading}
                className={`relative w-12 h-7 rounded-full transition ${state.optIn ? "bg-[#7C3AED]" : "bg-white/20"} disabled:opacity-50`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${state.optIn ? "translate-x-5" : ""}`}
                />
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
