"use client";

/** App Store public — listare aplicații published. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type AppCard = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  scopes: string[];
  developer_company: string;
  install_count: string | number;
};

export default function AppStoreClient() {
  const t = useTranslations("appStore");
  const [apps, setApps] = useState<AppCard[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/apps${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      const data = await res.json();
      setApps(data.apps ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">App Store</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <Link href="/developers" className="rounded border px-3 py-1.5 text-sm">Sunt dezvoltator</Link>
      </header>

      <input
        className="w-full rounded border p-2"
        placeholder={t("searchPlaceholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {loading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {!loading && apps.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <Link key={app.id} href={`/apps/${app.slug}`} className="rounded-lg border p-4 transition hover:shadow">
            <div className="flex items-center gap-3">
              {app.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.icon_url} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100 font-bold text-gray-500">
                  {app.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold">{app.name}</p>
                <p className="text-xs text-gray-500">{app.developer_company}</p>
              </div>
            </div>
            {app.description && <p className="mt-2 line-clamp-2 text-sm text-gray-600">{app.description}</p>}
            <p className="mt-2 text-xs text-gray-400">{app.install_count} instalări</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
