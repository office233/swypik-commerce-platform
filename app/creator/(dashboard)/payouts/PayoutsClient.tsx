"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Banknote, ExternalLink, CheckCircle2, AlertTriangle, Loader2, ArrowRightLeft } from "lucide-react";
import { formatMoneyCents } from "@/lib/i18n/currency";

type ConnectStatus = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  onboardedAt: string | null;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsDisabledReason: string | null;
};

type PayoutRow = {
  id: string;
  status: string;
  currency: string;
  gross_amount_cents: number;
  platform_fee_cents: number;
  net_amount_cents: number;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
};

type TransferRow = {
  id: string;
  status: string;
  currency: string;
  amount_cents: number;
  reversed_amount_cents: number;
  submitted_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_message: string | null;
  provider_transfer_id: string | null;
  created_at: string;
};

const formatMoney = (cents: number, currency: string) => formatMoneyCents(cents || 0, currency);

const TRANSFER_STATUS_CLASS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  submitted: "bg-blue-100 text-blue-800",
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  reversed: "bg-gray-100 text-gray-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function PayoutsClient({
  recentPayouts,
  recentTransfers = [],
}: {
  recentPayouts: PayoutRow[];
  recentTransfers?: TransferRow[];
}) {
  const tr = useTranslations("creatorPayouts");
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const TRANSFER_STATUS_LABEL = useMemo<Record<string, string>>(() => ({
    pending: tr("trAsteptare"),
    submitted: tr("trTrimis"),
    succeeded: tr("trFinalizat"),
    failed: tr("trEsuat"),
    reversed: tr("trAnulat"),
    cancelled: tr("trAnulat"),
  }), [tr]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe-connect/status", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setStatus(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const startOnboarding = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe-connect/onboarding/start", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setToast(data.error || tr("errPornireVerif"));
    } catch (e: any) {
      setToast(e?.message || tr("errRetea"));
    } finally {
      setBusy(false);
    }
  }, []);

  const openDashboard = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe-connect/login-link", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank", "noopener");
      } else {
        setToast(data.error || tr("errDashboard"));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (search.get("success") === "1") {
      setToast(tr("toastSuccess"));
      router.replace("/creator/payouts");
    } else if (search.get("refresh") === "1") {
      router.replace("/creator/payouts");
      void startOnboarding();
    }
    void loadStatus();
  }, [search, router, loadStatus, startOnboarding]);

  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(tm);
  }, [toast]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="mb-6 flex items-center gap-3">
        <Banknote size={28} className="text-[#0D0D0D]" />
        <div>
          <h1 className="text-3xl font-black">{tr("titlu")}</h1>
          <p className="text-sm text-[#6E6E80]">{tr("intro")}</p>
        </div>
      </header>

      {toast && (
        <div className="mb-4 rounded-xl border border-[#7C3AED]/20 bg-[#7C3AED]/10 px-4 py-3 text-sm font-semibold text-[#0D0D0D]">{toast}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[#6E6E80]"><Loader2 className="animate-spin" size={18} /> {tr("seIncarca")}</div>
      ) : !status?.accountId ? (
        <section className="rounded-2xl border border-[#E5E5E5] bg-white p-6">
          <h2 className="text-lg font-black mb-2">{tr("activeazaPlatile")}</h2>
          <p className="text-sm text-[#6E6E80] mb-4">{tr("explicaOnboarding")}</p>
          <button type="button" onClick={startOnboarding} disabled={busy} className="inline-flex items-center justify-center px-5 py-3 min-h-[44px] rounded-xl bg-[#0D0D0D] text-white font-bold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none hover:bg-black">
            {busy ? tr("seInitializeaza") : tr("activeazaPlatile")}
          </button>
        </section>
      ) : !status.detailsSubmitted ? (
        <section className="rounded-2xl border border-yellow-300 bg-yellow-50 p-6">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="text-yellow-600 mt-1" size={20} />
            <div>
              <h2 className="text-lg font-black">{tr("verifIncompleta")}</h2>
              <p className="text-sm text-[#6E6E80]">{tr("continuaProcesul")}</p>
            </div>
          </div>
          {status.requirementsCurrentlyDue.length > 0 && (
            <ul className="mb-4 text-xs text-[#6E6E80] list-disc pl-5">
              {status.requirementsCurrentlyDue.slice(0, 8).map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <button type="button" onClick={startOnboarding} disabled={busy} className="inline-flex items-center justify-center px-5 py-3 min-h-[44px] rounded-xl bg-[#0D0D0D] text-white font-bold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none hover:bg-black">
            {busy ? "..." : tr("continuaVerif")}
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border border-green-300 bg-green-50 p-6">
          <div className="flex items-start gap-3 mb-3">
            <CheckCircle2 className="text-green-600 mt-1" size={20} />
            <div>
              <h2 className="text-lg font-black text-green-900">{tr("platileActive")}</h2>
              <p className="text-sm text-[#6E6E80]">
                Charges: {status.chargesEnabled ? "✓" : "✗"} · Payouts: {status.payoutsEnabled ? "✓" : "✗"}
              </p>
            </div>
          </div>
          <button type="button" onClick={openDashboard} disabled={busy} className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-[#0D0D0D] text-white font-bold disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none hover:bg-black">
            {tr("deschideDashStripe")} <ExternalLink size={16} />
          </button>
        </section>
      )}

      <section className="mt-8">
        <h3 className="text-lg font-black mb-3 flex items-center gap-2"><ArrowRightLeft size={18} /> {tr("istoricTransferuri")}</h3>
        {recentTransfers.length === 0 ? (
          <p className="text-sm text-[#6E6E80]">{tr("nuTransferuri")}</p>
        ) : (
          <div className="rounded-2xl border border-[#E5E5E5] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-[#F7F7F8] text-left text-xs uppercase text-[#6E6E80]">
                  <tr>
                    <th className="px-4 py-2">{tr("thData")}</th>
                    <th className="px-4 py-2">{tr("thSuma")}</th>
                    <th className="px-4 py-2">{tr("thStatus")}</th>
                    <th className="px-4 py-2">{tr("thRef")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {recentTransfers.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(t.completed_at || t.submitted_at || t.created_at).toLocaleDateString("ro-RO")}</td>
                      <td className="px-4 py-3 font-bold whitespace-nowrap">{formatMoney(t.amount_cents - (t.reversed_amount_cents || 0), t.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${TRANSFER_STATUS_CLASS[t.status] || "bg-[#F7F7F8]"}`}>
                          {TRANSFER_STATUS_LABEL[t.status] || t.status}
                        </span>
                        {t.failure_message && (
                          <div className="mt-1 text-[11px] text-red-600">{t.failure_message}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#6E6E80] font-mono">{t.provider_transfer_id ? t.provider_transfer_id.slice(0, 14) + "…" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h3 className="text-lg font-black mb-3">{tr("ultimelePlati")}</h3>
        {recentPayouts.length === 0 ? (
          <p className="text-sm text-[#6E6E80]">{tr("nuPlati")}</p>
        ) : (
          <div className="rounded-2xl border border-[#E5E5E5] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-[#F7F7F8] text-left text-xs uppercase text-[#6E6E80]">
                  <tr>
                    <th className="px-4 py-2">{tr("thData")}</th>
                    <th className="px-4 py-2">{tr("thPerioada")}</th>
                    <th className="px-4 py-2">{tr("thNet")}</th>
                    <th className="px-4 py-2">{tr("thStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  {recentPayouts.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3">{new Date(p.paid_at || p.created_at).toLocaleDateString("ro-RO")}</td>
                      <td className="px-4 py-3 text-xs text-[#6E6E80]">
                        {p.period_start ? new Date(p.period_start).toLocaleDateString("ro-RO") : "—"} → {p.period_end ? new Date(p.period_end).toLocaleDateString("ro-RO") : "—"}
                      </td>
                      <td className="px-4 py-3 font-bold">{formatMoney(p.net_amount_cents, p.currency)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-1 rounded-md bg-[#F7F7F8] text-xs font-bold">{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
