"use client";

/**
 * Pagină detaliu app + flux instalare (consent screen) pentru selleri logați.
 * Install = POST /api/apps/oauth/authorize (consimțământ pe scopes).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type ScopeDetail = { scope: string; description: string };

type AppDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  oauth_client_id: string;
  developer_company: string;
  developer_website: string | null;
  scope_details: ScopeDetail[];
};

export default function AppDetailClient({ slug }: { slug: string }) {
  const [app, setApp] = useState<AppDetail | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/apps/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setApp(data.app);
      setInstalled(data.installed);
      setIsSeller(data.is_seller);
      setAccepted((data.app?.scope_details ?? []).map((s: ScopeDetail) => s.scope));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function install() {
    if (!app) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/apps/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: app.oauth_client_id, scopes: accepted }),
      });
      if (res.ok) {
        setInstalled(true);
        setShowConsent(false);
        setMessage("Aplicația a fost instalată. Dezvoltatorul o poate conecta acum prin OAuth.");
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error === "seller_login_required" ? "Trebuie să fii logat ca seller." : "Instalarea a eșuat.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function uninstall() {
    if (!app || !confirm(`Dezinstalezi „${app.name}"? Tokenul de acces va fi revocat.`)) return;
    const res = await fetch(`/api/apps/installs?app_id=${app.id}`, { method: "DELETE" });
    if (res.ok) {
      setInstalled(false);
      setMessage("Aplicația a fost dezinstalată.");
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Se încarcă…</div>;
  if (notFound || !app) {
    return (
      <div className="p-8 text-center text-gray-500">
        Aplicația nu există. <Link href="/apps" className="underline">Înapoi la App Store</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href="/apps" className="text-sm text-gray-500 underline">← App Store</Link>

      <header className="flex items-center gap-4">
        {app.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.icon_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 text-2xl font-bold text-gray-500">
            {app.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{app.name}</h1>
          <p className="text-sm text-gray-500">
            de {app.developer_company}
            {app.developer_website && (
              <> · <a href={app.developer_website} target="_blank" rel="noopener noreferrer" className="underline">website</a></>
            )}
          </p>
        </div>
      </header>

      {app.description && <p className="text-gray-700">{app.description}</p>}

      {message && <div className="rounded bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}

      {isSeller ? (
        installed ? (
          <button className="rounded border border-red-300 px-4 py-2 text-red-600" onClick={() => void uninstall()}>
            Dezinstalează
          </button>
        ) : showConsent ? (
          <div className="rounded-lg border p-4">
            <h2 className="font-semibold">&bdquo;{app.name}&rdquo; cere acces la:</h2>
            <ul className="mt-3 space-y-2">
              {app.scope_details.map((s) => (
                <li key={s.scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={accepted.includes(s.scope)}
                    onChange={() =>
                      setAccepted((prev) =>
                        prev.includes(s.scope) ? prev.filter((x) => x !== s.scope) : [...prev, s.scope],
                      )
                    }
                  />
                  <span><code className="rounded bg-gray-100 px-1 text-xs">{s.scope}</code> — {s.description}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
                disabled={busy || accepted.length === 0}
                onClick={() => void install()}
              >
                {busy ? "Se instalează…" : "Acceptă și instalează"}
              </button>
              <button className="rounded border px-4 py-2" onClick={() => setShowConsent(false)}>Anulează</button>
            </div>
          </div>
        ) : (
          <button className="rounded bg-black px-6 py-2 text-white" onClick={() => setShowConsent(true)}>
            Instalează
          </button>
        )
      ) : (
        <p className="text-sm text-gray-500">Loghează-te ca seller pentru a instala această aplicație.</p>
      )}
    </div>
  );
}
