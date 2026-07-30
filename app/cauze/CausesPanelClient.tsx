"use client";

/**
 * Panou cauze (Swypik Cares): înregistrare beneficiar, creare campanii
 * (doar cauze verificate) și raportare cheltuieli cu dovezi (prin /api/upload).
 */
import { useCallback, useEffect, useState } from "react";

type Cause = {
  id: string;
  kind: string;
  name: string;
  verification_status: string;
  location_city: string | null;
};

type Campaign = {
  id: string;
  cause_id: string;
  title: string;
  status: string;
  goal_cents: number;
  raised_cents: number;
  currency: string;
};

type Expense = {
  id: string;
  amount_cents: number;
  purpose: string;
  proof_url: string | null;
  status: string;
  created_at: string;
};

const VERIF_LABELS: Record<string, string> = {
  pending: "În așteptare",
  in_review: "În verificare",
  verified: "Verificată ✓",
  rejected: "Respinsă",
};

function lei(cents: number): string {
  return (cents / 100).toLocaleString("ro-RO", { maximumFractionDigits: 2 });
}

export default function CausesPanelClient() {
  const [causes, setCauses] = useState<Cause[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [expenses, setExpenses] = useState<Record<string, Expense[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [regForm, setRegForm] = useState({
    kind: "ngo", name: "", description: "", legal_id: "",
    contact_name: "", contact_email: "", contact_phone: "", location_city: "",
  });
  const [campForm, setCampForm] = useState({ cause_id: "", title: "", story: "", goal: "" });
  const [expForm, setExpForm] = useState({ campaign_id: "", amount: "", purpose: "", proof_url: "" });
  const [uploading, setUploading] = useState(false);

  const verifiedCauses = causes.filter((c) => c.verification_status === "verified");

  const load = useCallback(async () => {
    try {
      const [cRes, campRes] = await Promise.all([
        fetch("/api/causes"),
        fetch("/api/campaigns/manage"),
      ]);
      if (cRes.status === 401) {
        setError("Autentifică-te pentru a-ți administra cauzele.");
        return;
      }
      const cData = (await cRes.json()) as { causes?: Cause[] };
      const campData = (await campRes.json()) as { campaigns?: Campaign[] };
      setCauses(cData.causes ?? []);
      setCampaigns(campData.campaigns ?? []);
    } catch {
      setError("Eroare de rețea.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function registerCause(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/causes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: regForm.kind,
        name: regForm.name,
        description: regForm.description || undefined,
        legal_id: regForm.legal_id || undefined,
        contact_name: regForm.contact_name,
        contact_email: regForm.contact_email,
        contact_phone: regForm.contact_phone || undefined,
        location_city: regForm.location_city || undefined,
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (res.ok && data.success) {
      setMsg("Cauza a fost înregistrată. Verificarea se face de echipa Swypik.");
      setRegForm({ kind: "ngo", name: "", description: "", legal_id: "", contact_name: "", contact_email: "", contact_phone: "", location_city: "" });
      void load();
    } else {
      setMsg(data.error ?? "Eroare la înregistrare.");
    }
  }

  async function createCampaign(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg(null);
    const goalCents = Math.round(Number(campForm.goal) * 100);
    if (!campForm.cause_id || !Number.isFinite(goalCents) || goalCents < 100) {
      setMsg("Completează cauza și o țintă validă (minim 1 leu).");
      return;
    }
    const res = await fetch("/api/campaigns/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cause_id: campForm.cause_id,
        title: campForm.title,
        story: campForm.story || undefined,
        goal_cents: goalCents,
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (res.ok && data.success) {
      setMsg("Campania a fost creată (draft).");
      setCampForm({ cause_id: "", title: "", story: "", goal: "" });
      void load();
    } else {
      setMsg(data.error ?? "Eroare la creare.");
    }
  }

  async function uploadProof(file: File): Promise<void> {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("scope", "cares-proofs");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { success?: boolean; url?: string; error?: string };
      if (res.ok && data.url) {
        setExpForm((p) => ({ ...p, proof_url: data.url ?? "" }));
      } else {
        setMsg(data.error ?? "Eroare la upload.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function reportExpense(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setMsg(null);
    const amountCents = Math.round(Number(expForm.amount) * 100);
    if (!expForm.campaign_id || !Number.isFinite(amountCents) || amountCents <= 0 || !expForm.proof_url) {
      setMsg("Completează campania, suma și dovada (upload).");
      return;
    }
    const res = await fetch("/api/campaigns/manage/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: expForm.campaign_id,
        amount_cents: amountCents,
        purpose: expForm.purpose,
        proof_url: expForm.proof_url,
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (res.ok && data.success) {
      setMsg("Cheltuiala a fost raportată — apare public după confirmare.");
      const cid = expForm.campaign_id;
      setExpForm({ campaign_id: "", amount: "", purpose: "", proof_url: "" });
      void loadExpenses(cid);
    } else {
      setMsg(data.error ?? "Eroare la raportare.");
    }
  }

  const loadExpenses = useCallback(async (campaignId: string) => {
    const res = await fetch(`/api/campaigns/manage/expenses?campaign_id=${campaignId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { expenses?: Expense[] };
    setExpenses((prev) => ({ ...prev, [campaignId]: data.expenses ?? [] }));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Se încarcă…</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <header>
        <h1 className="text-2xl font-bold">Swypik Cares — panoul tău</h1>
        <p className="text-sm text-gray-500">Înregistrează o cauză, creează campanii și raportează transparent cheltuielile.</p>
      </header>

      {msg && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Cauzele mele</h2>
        {causes.length === 0 ? (
          <p className="text-sm text-gray-400">Nu ai nicio cauză înregistrată.</p>
        ) : (
          <ul className="space-y-2">
            {causes.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded border p-3 text-sm">
                <span>{c.name} <span className="text-gray-400">({c.kind})</span></span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.verification_status === "verified" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {VERIF_LABELS[c.verification_status] ?? c.verification_status}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={(e) => void registerCause(e)} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select className="rounded border px-3 py-2 text-sm" value={regForm.kind}
            onChange={(e) => setRegForm((p) => ({ ...p, kind: e.target.value }))}>
            <option value="ngo">ONG</option>
            <option value="family">Familie</option>
            <option value="small_business">Business mic</option>
            <option value="community">Comunitate</option>
            <option value="emergency">Urgență</option>
          </select>
          <input required className="rounded border px-3 py-2 text-sm" placeholder="Numele cauzei"
            value={regForm.name} onChange={(e) => setRegForm((p) => ({ ...p, name: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="CUI / CIF (opțional)"
            value={regForm.legal_id} onChange={(e) => setRegForm((p) => ({ ...p, legal_id: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Oraș"
            value={regForm.location_city} onChange={(e) => setRegForm((p) => ({ ...p, location_city: e.target.value }))} />
          <input required className="rounded border px-3 py-2 text-sm" placeholder="Persoană de contact"
            value={regForm.contact_name} onChange={(e) => setRegForm((p) => ({ ...p, contact_name: e.target.value }))} />
          <input required type="email" className="rounded border px-3 py-2 text-sm" placeholder="Email contact"
            value={regForm.contact_email} onChange={(e) => setRegForm((p) => ({ ...p, contact_email: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Telefon (opțional)"
            value={regForm.contact_phone} onChange={(e) => setRegForm((p) => ({ ...p, contact_phone: e.target.value }))} />
          <textarea className="rounded border px-3 py-2 text-sm sm:col-span-2" rows={2} placeholder="Descriere"
            value={regForm.description} onChange={(e) => setRegForm((p) => ({ ...p, description: e.target.value }))} />
          <button type="submit" className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 sm:col-span-2">
            Înregistrează cauza (verificare manuală)
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Campanii</h2>
        {campaigns.length > 0 && (
          <ul className="mb-4 space-y-2">
            {campaigns.map((c) => (
              <li key={c.id} className="rounded border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-xs text-gray-500">{c.status}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-gray-100">
                  <div className="h-full bg-rose-500" style={{ width: `${Math.min(100, (c.raised_cents / Math.max(1, c.goal_cents)) * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-500">{lei(c.raised_cents)} / {lei(c.goal_cents)} {c.currency}</p>
                <button onClick={() => void loadExpenses(c.id)} className="mt-1 text-xs text-blue-600 underline">
                  Vezi cheltuielile raportate
                </button>
                {expenses[c.id] && (
                  <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-gray-600">
                    {expenses[c.id].length === 0 && <li>Nicio cheltuială raportată.</li>}
                    {expenses[c.id].map((x) => (
                      <li key={x.id}>
                        {lei(x.amount_cents)} lei — {x.purpose} ({x.status})
                        {x.proof_url && (
                          <a href={x.proof_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-600 underline">dovadă</a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {verifiedCauses.length === 0 ? (
          <p className="text-sm text-amber-600">Poți crea campanii după ce o cauză este verificată.</p>
        ) : (
          <form onSubmit={(e) => void createCampaign(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select required className="rounded border px-3 py-2 text-sm" value={campForm.cause_id}
              onChange={(e) => setCampForm((p) => ({ ...p, cause_id: e.target.value }))}>
              <option value="">Alege cauza…</option>
              {verifiedCauses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input required className="rounded border px-3 py-2 text-sm" placeholder="Titlul campaniei"
              value={campForm.title} onChange={(e) => setCampForm((p) => ({ ...p, title: e.target.value }))} />
            <input required inputMode="decimal" className="rounded border px-3 py-2 text-sm" placeholder="Țintă (lei)"
              value={campForm.goal} onChange={(e) => setCampForm((p) => ({ ...p, goal: e.target.value }))} />
            <textarea className="rounded border px-3 py-2 text-sm sm:col-span-2" rows={2} placeholder="Povestea campaniei"
              value={campForm.story} onChange={(e) => setCampForm((p) => ({ ...p, story: e.target.value }))} />
            <button type="submit" className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 sm:col-span-2">
              Creează campania
            </button>
          </form>
        )}
      </section>

      {campaigns.length > 0 && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Raportează o cheltuială (cu dovadă)</h2>
          <form onSubmit={(e) => void reportExpense(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select required className="rounded border px-3 py-2 text-sm" value={expForm.campaign_id}
              onChange={(e) => setExpForm((p) => ({ ...p, campaign_id: e.target.value }))}>
              <option value="">Alege campania…</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <input required inputMode="decimal" className="rounded border px-3 py-2 text-sm" placeholder="Sumă (lei)"
              value={expForm.amount} onChange={(e) => setExpForm((p) => ({ ...p, amount: e.target.value }))} />
            <input required className="rounded border px-3 py-2 text-sm sm:col-span-2" placeholder="Scop (ex: plată factură spital)"
              value={expForm.purpose} onChange={(e) => setExpForm((p) => ({ ...p, purpose: e.target.value }))} />
            <div className="sm:col-span-2">
              <label className="block text-sm text-gray-600">
                Dovadă (factură/chitanță — png/jpg/webp):
                <input type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block text-sm"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadProof(f); }} />
              </label>
              {uploading && <p className="text-xs text-gray-400">Se încarcă…</p>}
              {expForm.proof_url && <p className="text-xs text-green-600">Dovadă încărcată ✓</p>}
            </div>
            <button type="submit" disabled={uploading}
              className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 sm:col-span-2">
              Raportează cheltuiala
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
