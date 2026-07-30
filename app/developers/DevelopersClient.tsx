"use client";

/**
 * Portal dezvoltatori:
 *  - înregistrare cont (status pending → aprobare din ERP)
 *  - listare/creare/editare apps
 *  - afișare chei (client_secret o singură dată) + regenerare secret
 */
import { useCallback, useEffect, useState } from "react";

type Developer = {
  id: string;
  company: string;
  website: string | null;
  status: string;
  created_at: string;
};

type App = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  scopes: string[];
  webhook_url: string | null;
  oauth_client_id: string;
  status: string;
  install_count: number;
};

const ALL_SCOPES = [
  "read_products",
  "write_products",
  "read_orders",
  "write_orders",
  "read_analytics",
] as const;

export default function DevelopersClient() {
  const [loading, setLoading] = useState(true);
  const [developer, setDeveloper] = useState<Developer | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [error, setError] = useState<string | null>(null);

  // înregistrare
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");

  // creare app
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);

  // secret afișat o singură dată
  const [freshSecret, setFreshSecret] = useState<{ appName: string; clientId?: string; secret: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/developers/me");
      if (meRes.status === 401) {
        setError("Trebuie să fii logat pentru a accesa portalul de dezvoltatori.");
        return;
      }
      const me = await meRes.json();
      setDeveloper(me.developer ?? null);
      if (me.developer?.status === "approved") {
        const appsRes = await fetch("/api/developers/apps");
        if (appsRes.ok) {
          const data = await appsRes.json();
          setApps(data.apps ?? []);
        }
      }
    } catch {
      setError("Eroare de rețea.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function register() {
    const res = await fetch("/api/developers/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, website: website || undefined }),
    });
    if (res.ok || res.status === 409) void load();
    else setError("Înregistrarea a eșuat. Verifică datele.");
  }

  async function createApp() {
    const res = await fetch("/api/developers/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug,
        description: description || undefined,
        webhook_url: webhookUrl || undefined,
        scopes,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setFreshSecret({ appName: name, clientId: data.oauth_client_id, secret: data.oauth_client_secret });
      setShowCreate(false);
      setName(""); setSlug(""); setDescription(""); setWebhookUrl(""); setScopes([]);
      void load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error === "slug_taken" ? "Slug-ul este deja folosit." : "Crearea a eșuat.");
    }
  }

  async function rotateSecret(app: App) {
    if (!confirm(`Regenerezi secretul pentru „${app.name}"? Cel vechi devine invalid.`)) return;
    const res = await fetch(`/api/developers/apps/${app.id}/rotate-secret`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setFreshSecret({ appName: app.name, secret: data.oauth_client_secret });
    }
  }

  async function submitReview(app: App) {
    await fetch(`/api/developers/apps/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "review" }),
    });
    void load();
  }

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Se încarcă…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-bold">Portal dezvoltatori</h1>
        <p className="text-sm text-gray-500">Construiește aplicații pentru sellerii Swypik.</p>
      </header>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {freshSecret && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold">Chei pentru &bdquo;{freshSecret.appName}&rdquo; — salvează-le ACUM, secretul nu va mai fi afișat!</p>
          {freshSecret.clientId && (
            <p className="mt-2">Client ID: <code className="rounded bg-white px-1 font-mono">{freshSecret.clientId}</code></p>
          )}
          <p className="mt-1">Client Secret: <code className="rounded bg-white px-1 font-mono break-all">{freshSecret.secret}</code></p>
          <button className="mt-3 rounded bg-amber-600 px-3 py-1 text-white" onClick={() => setFreshSecret(null)}>
            Am salvat cheile
          </button>
        </div>
      )}

      {!developer && !error && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Înregistrează-te ca dezvoltator</h2>
          <div className="mt-3 space-y-2">
            <input className="w-full rounded border p-2" placeholder="Companie *" value={company} onChange={(e) => setCompany(e.target.value)} />
            <input className="w-full rounded border p-2" placeholder="Website (https://…)" value={website} onChange={(e) => setWebsite(e.target.value)} />
            <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-40" disabled={company.trim().length < 2} onClick={() => void register()}>
              Trimite cererea
            </button>
          </div>
        </section>
      )}

      {developer && developer.status === "pending" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Cererea ta ({developer.company}) este în așteptare. Vei fi notificat după aprobare.
        </div>
      )}
      {developer && developer.status === "rejected" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Cererea ta a fost respinsă.
        </div>
      )}

      {developer?.status === "approved" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Aplicațiile mele</h2>
            <button className="rounded bg-black px-3 py-1.5 text-sm text-white" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Anulează" : "+ App nou"}
            </button>
          </div>

          {showCreate && (
            <div className="space-y-2 rounded-lg border p-4">
              <input className="w-full rounded border p-2" placeholder="Nume *" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="w-full rounded border p-2" placeholder="slug-unic *" value={slug} onChange={(e) => setSlug(e.target.value)} />
              <textarea className="w-full rounded border p-2" placeholder="Descriere" value={description} onChange={(e) => setDescription(e.target.value)} />
              <input className="w-full rounded border p-2" placeholder="Webhook URL (https://…)" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
              <div className="flex flex-wrap gap-2 text-sm">
                {ALL_SCOPES.map((s) => (
                  <label key={s} className={`cursor-pointer rounded-full border px-3 py-1 ${scopes.includes(s) ? "border-black bg-black text-white" : ""}`}>
                    <input type="checkbox" className="hidden" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                    {s}
                  </label>
                ))}
              </div>
              <button
                className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
                disabled={name.trim().length < 2 || !/^[a-z0-9][a-z0-9-]*$/.test(slug)}
                onClick={() => void createApp()}
              >
                Creează app
              </button>
            </div>
          )}

          {apps.length === 0 && !showCreate && <p className="text-sm text-gray-500">Nu ai încă aplicații.</p>}

          {apps.map((app) => (
            <div key={app.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{app.name}</span>{" "}
                  <span className="text-xs text-gray-500">/{app.slug}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${app.status === "published" ? "bg-green-100 text-green-800" : app.status === "review" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"}`}>
                  {app.status}
                </span>
              </div>
              {app.description && <p className="mt-1 text-sm text-gray-600">{app.description}</p>}
              <p className="mt-2 text-xs text-gray-500">
                Client ID: <code className="font-mono">{app.oauth_client_id}</code> · Instalări: {app.install_count} · Scopes: {app.scopes.join(", ") || "—"}
              </p>
              <div className="mt-3 flex gap-2 text-sm">
                <button className="rounded border px-3 py-1" onClick={() => void rotateSecret(app)}>Regenerează secret</button>
                {app.status === "draft" && (
                  <button className="rounded border px-3 py-1" onClick={() => void submitReview(app)}>Trimite spre publicare</button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
