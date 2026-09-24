"use client";

/**
 * Portal dezvoltatori:
 *  - înregistrare cont (status pending → aprobare din ERP)
 *  - listare/creare/editare apps
 *  - afișare chei (client_secret o singură dată) + regenerare secret
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

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

type Delivery = {
  event: string;
  status_code: number | null;
  error: string | null;
  attempts: number;
  created_at: string;
};

const ALL_SCOPES = [
  "read_products",
  "write_products",
  "read_orders",
  "write_orders",
  "read_analytics",
] as const;

export default function DevelopersClient() {
  const t = useTranslations("developers");
  const tx = useTranslations("devPortal");
  const locale = useLocale();
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

  // editare app existent
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editWebhookUrl, setEditWebhookUrl] = useState("");

  // livrări webhook
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/developers/me");
      if (meRes.status === 401) {
        setError(tx("errorLoginRequired"));
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
      setError(tx("errorNetwork"));
    } finally {
      setLoading(false);
    }
  }, [tx]);

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
    else setError(tx("errorRegisterFailed"));
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
      setError(data.error === "slug_taken" ? tx("errorSlugTaken") : tx("errorCreateFailed"));
    }
  }

  async function rotateSecret(app: App) {
    if (!confirm(tx("confirmRotateSecret", { appName: app.name }))) return;
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

  function startEdit(app: App) {
    setEditingId(app.id);
    setEditName(app.name);
    setEditDescription(app.description ?? "");
    setEditWebhookUrl(app.webhook_url ?? "");
  }

  async function saveEdit(app: App) {
    const res = await fetch(`/api/developers/apps/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        description: editDescription || null,
        webhook_url: editWebhookUrl || null,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      void load();
    } else {
      setError(tx("errorSaveFailed"));
    }
  }

  async function loadDeliveries(app: App) {
    if (deliveriesFor === app.id) {
      setDeliveriesFor(null);
      setDeliveries([]);
      return;
    }
    setDeliveriesFor(app.id);
    setDeliveriesLoading(true);
    try {
      const res = await fetch(`/api/developers/apps/${app.id}/deliveries`);
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries ?? []);
      } else {
        setDeliveries([]);
      }
    } finally {
      setDeliveriesLoading(false);
    }
  }

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  if (loading) return <div className="p-8 text-center text-gray-500">{tx("loading")}</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-bold">{tx("title")}</h1>
        <p className="text-sm text-gray-500">{tx("subtitle")}</p>
      </header>

      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      {freshSecret && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
          <p className="font-semibold break-words">{tx("keysForApp", { appName: freshSecret.appName })}</p>
          {freshSecret.clientId && (
            <p className="mt-2 break-all">{tx("clientIdLabel")} <code className="rounded bg-white px-1 font-mono dark:bg-gray-900">{freshSecret.clientId}</code></p>
          )}
          <p className="mt-1 break-all">{tx("clientSecretLabel")} <code className="rounded bg-white px-1 font-mono break-all dark:bg-gray-900">{freshSecret.secret}</code></p>
          <button className="mt-3 min-h-10 rounded bg-amber-600 px-3 py-1 text-white" onClick={() => setFreshSecret(null)}>
            {tx("savedKeysButton")}
          </button>
        </div>
      )}

      {!developer && !error && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">{tx("registerTitle")}</h2>
          <div className="mt-3 space-y-2">
            <input aria-label={tx("companyPlaceholder")} className="w-full rounded border p-2" placeholder={tx("companyPlaceholder")} value={company} onChange={(e) => setCompany(e.target.value)} />
            <input aria-label={tx("websitePlaceholder")} className="w-full rounded border p-2" placeholder={tx("websitePlaceholder")} value={website} onChange={(e) => setWebsite(e.target.value)} />
            <button className="min-h-10 rounded bg-black px-4 py-2 text-white disabled:opacity-40" disabled={company.trim().length < 2} onClick={() => void register()}>
              {tx("submitRequest")}
            </button>
          </div>
        </section>
      )}

      {developer && developer.status === "pending" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 break-words dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
          {tx("pendingStatus", { company: developer.company })}
        </div>
      )}
      {developer && developer.status === "rejected" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {tx("rejectedStatus")}
        </div>
      )}

      {developer?.status === "approved" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{tx("myApps")}</h2>
            <button className="min-h-10 rounded bg-black px-3 py-1.5 text-sm text-white" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? tx("cancelButton") : tx("newAppButton")}
            </button>
          </div>

          {showCreate && (
            <div className="space-y-2 rounded-lg border p-4">
              <input aria-label={tx("namePlaceholder")} className="w-full rounded border p-2" placeholder={tx("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
              <input aria-label={tx("slugPlaceholder")} className="w-full rounded border p-2" placeholder={tx("slugPlaceholder")} value={slug} onChange={(e) => setSlug(e.target.value)} />
              <textarea aria-label={tx("descriptionPlaceholder")} className="w-full rounded border p-2" placeholder={tx("descriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} />
              <input aria-label={tx("webhookPlaceholder")} className="w-full rounded border p-2" placeholder={tx("webhookPlaceholder")} value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
              <div className="flex flex-wrap gap-2 text-sm">
                {ALL_SCOPES.map((s) => (
                  <label key={s} className={`min-h-10 cursor-pointer rounded-full border px-3 py-1 flex items-center ${scopes.includes(s) ? "border-black bg-black text-white" : ""}`}>
                    <input type="checkbox" className="hidden" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                    {s}
                  </label>
                ))}
              </div>
              <button
                className="min-h-10 rounded bg-black px-4 py-2 text-white disabled:opacity-40"
                disabled={name.trim().length < 2 || !/^[a-z0-9][a-z0-9-]*$/.test(slug)}
                onClick={() => void createApp()}
              >
                {t("creeazaApp")}
              </button>
            </div>
          )}

          {apps.length === 0 && !showCreate && <p className="text-sm text-gray-500">{tx("noApps")}</p>}

          {apps.map((app) => (
            <div key={app.id} className="rounded-lg border p-4 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold break-words">{app.name}</span>{" "}
                  <span className="text-xs text-gray-500 break-all">/{app.slug}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs shrink-0 ${app.status === "published" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : app.status === "review" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                  {app.status}
                </span>
              </div>
              {app.description && <p className="mt-1 text-sm text-gray-600 break-words">{app.description}</p>}
              <p className="mt-2 text-xs text-gray-500 break-all">
                {tx("clientIdLabel")} <code className="font-mono">{app.oauth_client_id}</code> · {tx("installsCount", { count: app.install_count })} · {tx("scopesLabel")} {app.scopes.join(", ") || "—"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <button className="min-h-10 rounded border px-3 py-1" onClick={() => void rotateSecret(app)}>{tx("rotateSecret")}</button>
                {app.status === "draft" && (
                  <button className="min-h-10 rounded border px-3 py-1" onClick={() => void submitReview(app)}>{t("trimiteSprePublicare")}</button>
                )}
                <button className="min-h-10 rounded border px-3 py-1" onClick={() => (editingId === app.id ? setEditingId(null) : startEdit(app))}>
                  {editingId === app.id ? tx("cancelEditButton") : tx("editButton")}
                </button>
                <button className="min-h-10 rounded border px-3 py-1" onClick={() => void loadDeliveries(app)}>
                  {deliveriesFor === app.id ? tx("hideDeliveriesButton") : tx("webhookDeliveriesButton")}
                </button>
              </div>

              {editingId === app.id && (
                <div className="mt-3 space-y-2 rounded border p-3">
                  <input aria-label={tx("namePlaceholder")} className="w-full rounded border p-2" placeholder={tx("namePlaceholder")} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <textarea aria-label={tx("descriptionPlaceholder")} className="w-full rounded border p-2" placeholder={tx("descriptionPlaceholder")} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                  <input aria-label={tx("webhookPlaceholder")} className="w-full rounded border p-2" placeholder={tx("webhookPlaceholder")} value={editWebhookUrl} onChange={(e) => setEditWebhookUrl(e.target.value)} />
                  <button
                    className="min-h-10 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
                    disabled={editName.trim().length < 2}
                    onClick={() => void saveEdit(app)}
                  >
                    {t("salveaza")}
                  </button>
                </div>
              )}

              {deliveriesFor === app.id && (
                <div className="mt-3 rounded border p-3 overflow-x-auto">
                  {deliveriesLoading && <p className="text-sm text-gray-500">{tx("loadingDeliveries")}</p>}
                  {!deliveriesLoading && deliveries.length === 0 && (
                    <p className="text-sm text-gray-500">{tx("noDeliveries")}</p>
                  )}
                  {!deliveriesLoading && deliveries.length > 0 && (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b text-gray-500">
                          <th className="py-1 pr-2">{tx("tableEvent")}</th>
                          <th className="py-1 pr-2">{tx("tableStatus")}</th>
                          <th className="py-1 pr-2">{tx("thAttempts")}</th>
                          <th className="py-1">{tx("thDate")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveries.map((d, i) => (
                          <tr key={`${d.event}-${d.created_at}-${i}`} className="border-b last:border-0">
                            <td className="py-1 pr-2 font-mono">{d.event}</td>
                            <td className={`py-1 pr-2 ${d.error || (d.status_code ?? 0) >= 400 ? "text-red-600" : "text-green-700"}`}>
                              {d.status_code ?? d.error ?? "—"}
                            </td>
                            <td className="py-1 pr-2">{d.attempts}</td>
                            <td className="py-1">{new Date(d.created_at).toLocaleString(locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
