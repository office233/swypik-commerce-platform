"use client";

import Link from "next/link";
import { Wallet, Clock, CheckCircle2, CalendarClock, ExternalLink, AlertTriangle } from "lucide-react";

type SellerInfo = {
  id: string;
  name: string | null;
  email: string;
  hasStripe: boolean;
  stripeAccountId: string | null;
};

type Summary = {
  availableCents: number;
  pendingCents: number;
  paid90Cents: number;
  currency: string;
};

type TransferRow = {
  id: string;
  status: string;
  currency: string;
  amount_cents: number;
  provider_transfer_id: string | null;
  created_at: string;
  completed_at: string | null;
};

function fmt(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: (currency || "RON").toUpperCase(),
    }).format((cents || 0) / 100);
  } catch {
    return `${((cents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending: "În așteptare",
  submitted: "Trimis",
  succeeded: "Finalizat",
  failed: "Eșuat",
  reversed: "Anulat",
  cancelled: "Anulat",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  submitted: "bg-blue-100 text-blue-800",
  succeeded: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  reversed: "bg-gray-100 text-gray-700",
  cancelled: "bg-gray-100 text-gray-700",
};

export default function PayoutsClient({
  seller,
  summary,
  transfers,
  nextPayoutIso,
}: {
  seller: SellerInfo;
  summary: Summary;
  transfers: TransferRow[];
  nextPayoutIso: string;
}) {
  if (!seller.hasStripe) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-black text-[#0D0D0D] mb-2">Payout-uri</h1>
        <p className="text-sm text-[#6E6E80] mb-6">Pentru a primi banii din vânzări, configurează contul Stripe Connect.</p>

        <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-yellow-700" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black text-[#0D0D0D] mb-1">Cont Stripe Connect lipsă</h2>
              <p className="text-sm text-[#6E6E80] mb-4">
                Plățile se procesează prin Stripe Connect. Fără un cont activ, nu putem trimite payout-uri către IBAN.
              </p>
              <Link
                href="/seller/settings"
                className="inline-flex items-center gap-2 bg-[#0D0D0D] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-black transition"
              >
                Configurează Stripe Connect
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const kpis = [
    { label: "Sold disponibil", value: fmt(summary.availableCents, summary.currency), icon: Wallet, accent: "text-green-700 bg-green-100" },
    { label: "În tranzit", value: fmt(summary.pendingCents, summary.currency), icon: Clock, accent: "text-yellow-700 bg-yellow-100" },
    { label: "Total plătit 90z", value: fmt(summary.paid90Cents, summary.currency), icon: CheckCircle2, accent: "text-blue-700 bg-blue-100" },
    { label: "Următorul payout", value: fmtDate(nextPayoutIso), icon: CalendarClock, accent: "text-purple-700 bg-purple-100" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-black text-[#0D0D0D]">Payout-uri</h1>
        <p className="text-sm text-[#6E6E80] mt-1">
          Stripe Connect: <span className="font-mono text-xs">{seller.stripeAccountId}</span>
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white border border-[#E5E5E5] rounded-2xl p-4 md:p-5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${k.accent}`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-[11px] uppercase tracking-wide text-[#6E6E80] font-bold mb-1">{k.label}</p>
              <p className="text-lg md:text-xl font-black text-[#0D0D0D]">{k.value}</p>
            </div>
          );
        })}
      </div>

      <section className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <h2 className="text-base font-black text-[#0D0D0D]">Ultimele transferuri</h2>
          <span className="text-xs text-[#6E6E80]">{transfers.length} înregistrări</span>
        </div>

        {transfers.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6E6E80]">
            Nu există încă transferuri către contul tău Stripe.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7F8] text-[#6E6E80]">
                <tr>
                  <th className="text-left font-bold px-4 py-3">Data</th>
                  <th className="text-right font-bold px-4 py-3">Sumă</th>
                  <th className="text-left font-bold px-4 py-3">Status</th>
                  <th className="text-left font-bold px-4 py-3">Stripe ID</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-t border-[#E5E5E5]">
                    <td className="px-4 py-3 text-[#0D0D0D]">{fmtDate(t.created_at)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#0D0D0D]">
                      {fmt(t.amount_cents, t.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${STATUS_CLASS[t.status] || "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#6E6E80]">
                      {t.provider_transfer_id || "—"}
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
