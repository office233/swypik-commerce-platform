"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Banknote, ExternalLink, CheckCircle2, AlertTriangle, Loader2, ArrowRightLeft } from "lucide-react";

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

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ro-RO", { style: "currency", currency: (currency || "RON").toUpperCase() }).format((cents || 0) / 100);
  } catch {
    return `${((cents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  pending: "În așteptare",
  submitted: "Trimis",
  succeeded: "Finalizat",
  failed: "Eșuat",
  reversed: "Anulat",
  cancelled: "Anulat",
};

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
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
      setToast(data.error || "Eroare la pornirea verificării");
    } catch (e: any) {
      setToast(e?.message || "Eroare de rețea");
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
        setToast(data.error || "Eroare la deschiderea dashboard-ului");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (search.get("success") === "1") {
      setToast("Felicitări, contul tău Stripe e activ!");
      router.replace("/creator/payouts");
    } else if (search.get("refresh") === "1") {
      router.replace("/creator/payouts");
      void startOnboarding();
    }
    void loadStatus();
  }, [search, router, loadStatus, startOnboarding]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="mb-6 flex items-center gap-3">
        <Banknote size={28} className="text-[#0D0D0D]" />
        <div>
          <h1 className="text-3xl font-black">Plăți</h1>
          <p className="text-sm text-[#6E6E80]">Configurează contul Stripe Connect pentru a primi încasările din vânzări și comisioane.</p>
        </div>
      </header>

      {toast && (
        <div className="mb-4 rounded-xl border border-[#7C3AED]/20 bg-[#7C3AED]/10 px-4 py-3 text-sm font-semibold text-[#0D0D0D]">{toast}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[#6E6E80]"><Loader2 className="animate-spin" size={18} /> Se încarcă...</div>
      ) : !status?.accountId ? (
        <section className="rounded-2xl border border-[#E5E5E5] bg-white p-6">
          <h2 className="text-lg font-black mb-2">Activează plățile</h2>
          <p className="text-sm text-[#6E6E80] mb-4">Vei fi redirecționat către Stripe pentru a-ți completa datele de identitate și contul bancar. Procesul durează 3-5 minute.</p>
          <button onClick={startOnboarding} disabled={busy} className="px-5 py-3 rounded-xl bg-[#0D0D0D] text-white font-bold disabled:opacity-50">
            {busy ? "Se inițializează..." : "Activează plățile"}
          </button>
        </section>
      ) : !status.detailsSubmitted ? (
        <section className="rounded-2xl border border-yellow-300 bg-yellow-50 p-6">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="text-yellow-600 mt-1" size={20} />
            <div>
              <h2 className="text-lg font-black">Verificare incompletă</h2>
              <p className="text-sm text-[#6E6E80]">Continuă procesul Stripe pentru a-ți activa contul.</p>
            </div>
          </div>
          {status.requirementsCurrentlyDue.length > 0 && (
            <ul className="mb-4 text-xs text-[#6E6E80] list-disc pl-5">
              {status.requirementsCurrentlyDue.slice(0, 8).map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <button onClick={startOnboarding} disabled={busy} className="px-5 py-3 rounded-xl bg-[#0D0D0D] text-white font-bold disabled:opacity-50">
            {busy ? "..." : "Continuă verificarea"}
          </button>
        </section>
      ) : (
        <section className="rounded-2xl border border-green-300 bg-green-50 p-6">
          <div className="flex items-start gap-3 mb-3">
            <CheckCircle2 className="text-green-600 mt-1" size={20} />
            <div>
              <h2 className="text-lg font-black text-green-900">Plățile sunt active</h2>
              <p className="text-sm text-[#6E6E80]">
                Charges: {status.chargesEnabled ? "✓" : "✗"} · Payouts: {status.payoutsEnabled ? "✓" : "✗"}
              </p>
            </div>
          </div>
          <button onClick={openDashboard} disabled={busy} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0D0D0D] text-white font-bold disabled:opacity-50">
            Deschide dashboard Stripe <ExternalLink size={16} />
          </button>
        </section>
      )}

      <section className="mt-8">
        <h3 className="text-lg font-black mb-3 flex items-center gap-2"><ArrowRightLeft size={18} /> Istoric transferuri Stripe</h3>
        {recentTransfers.length === 0 ? (
          <p className="text-sm text-[#6E6E80]">Nu există transferuri Stripe încă.</p>
        ) : (
          <div className="rounded-2xl border border-[#E5E5E5] bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7F8] text-left text-xs uppercase text-[#6E6E80]">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Sumă</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Ref</th>
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
        )}
      </section>

      <section className="mt-8">
        <h3 className="text-lg font-black mb-3">Ultimele plăți (comisioane)</h3>
        {recentPayouts.length === 0 ? (
          <p className="text-sm text-[#6E6E80]">Nu există plăți încă.</p>
        ) : (
          <div className="rounded-2xl border border-[#E5E5E5] bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7F8] text-left text-xs uppercase text-[#6E6E80]">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Perioadă</th>
                  <th className="px-4 py-2">Net</th>
                  <th className="px-4 py-2">Status</th>
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
        )}
      </section>
    </div>
  );
}
