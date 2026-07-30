"use client";

/**
 * FRONT R5 — Admin: cereri de retragere curieri (payout_requests).
 * Listă + aprobare (paid) / respingere (rejected, cu refund automat în wallet).
 */
import { useCallback, useEffect, useState } from "react";

type Payout = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "paid" | "rejected";
  iban: string | null;
  admin_note: string | null;
  requested_at: string;
  resolved_at: string | null;
  email: string | null;
  display_name: string | null;
  balance_cents: number;
};

const ron = (c: number) => (c / 100).toFixed(2) + " RON";

export default function CourierPayoutsAdminPage() {
  const [status, setStatus] = useState<string>("pending");
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courier-payouts${status ? `?status=${status}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eroare la încărcare.");
      setPayouts(data.payouts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (id: string, action: "paid" | "rejected") => {
    const note = action === "rejected" ? window.prompt("Motiv respingere (opțional):") ?? undefined : undefined;
    setBusy(id);
    try {
      const res = await fetch("/api/admin/courier-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Operațiunea a eșuat.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Retrageri curieri</h1>

      <div className="flex gap-2 mb-4">
        {["pending", "paid", "rejected", ""].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              status === s ? "bg-black text-white" : "bg-white hover:bg-gray-50"
            }`}
          >
            {s === "" ? "Toate" : s === "pending" ? "În așteptare" : s === "paid" ? "Plătite" : "Respinse"}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {loading ? (
        <div className="text-gray-500">Se încarcă…</div>
      ) : payouts.length === 0 ? (
        <div className="text-gray-500">Nicio cerere.</div>
      ) : (
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">Curier</th>
                <th className="p-3">Sumă</th>
                <th className="p-3">Sold curent</th>
                <th className="p-3">IBAN</th>
                <th className="p-3">Cerută la</th>
                <th className="p-3">Status</th>
                <th className="p-3">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{p.display_name || "—"}</div>
                    <div className="text-gray-500 text-xs">{p.email}</div>
                  </td>
                  <td className="p-3 font-semibold">{ron(p.amount_cents)}</td>
                  <td className={`p-3 ${p.balance_cents < 0 ? "text-red-600" : ""}`}>{ron(p.balance_cents)}</td>
                  <td className="p-3 font-mono text-xs">{p.iban || "—"}</td>
                  <td className="p-3 text-gray-500">{new Date(p.requested_at).toLocaleString("ro-RO")}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        p.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : p.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {p.status}
                    </span>
                    {p.admin_note && <div className="text-xs text-gray-400 mt-1">{p.admin_note}</div>}
                  </td>
                  <td className="p-3">
                    {p.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          disabled={busy === p.id}
                          onClick={() => resolve(p.id, "paid")}
                          className="px-2.5 py-1 rounded-lg bg-green-600 text-white text-xs disabled:opacity-50"
                        >
                          Plătit
                        </button>
                        <button
                          disabled={busy === p.id}
                          onClick={() => resolve(p.id, "rejected")}
                          className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs disabled:opacity-50"
                        >
                          Respinge
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
