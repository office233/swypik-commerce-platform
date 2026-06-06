import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { safeJsonLd } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";



export async function generateMetadata(): Promise<Metadata> {
  const c = await cookies();
  const v = c.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(v) ? v : DEFAULT_LOCALE;
  const t = await getTranslations({ locale, namespace: "pageMeta.categories" });
  const meta = { title: t("title"), description: t("description") };
  const canonical = `${BASE_URL}/categories`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical, languages: languagesForMetadata("/categories") },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
      siteName: "Swypik",
      type: "website",
      images: [{ url: "/og-preview.webp", width: 1200, height: 630, alt: "Swypik Categories" }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: ["/og-preview.webp"],
    },
  };
}


type Node = {
  id: string;
  name: string;
  count?: number;
  kind?: string;
  children?: Node[];
};

const BG = "#FFFFFF";
const ACCENT = "#7C3AED";

async function fetchHierarchy(locale: string): Promise<Node[]> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || "https";
    const res = await fetch(`${proto}://${host}/api/categories?locale=${locale}`, {
      cache: "no-store",
      headers: { cookie: h.get("cookie") || "" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.hierarchy) ? (data.hierarchy as Node[]) : [];
  } catch {
    return [];
  }
}

export default async function CategoriesPage() {
  const cookieStore = await cookies();
  const cLoc = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cLoc) ? cLoc : DEFAULT_LOCALE;
  const hierarchy = await fetchHierarchy(locale);

  const tLabels = await getTranslations({ locale, namespace: "categoriesPage" });
  const tMeta = await getTranslations({ locale, namespace: "pageMeta.categories" });
  const labels = {
    title: tLabels("title"),
    browse: tLabels("browse"),
    products: tLabels("products"),
    empty: tLabels("empty"),
  };

  return (
    <main className="min-h-screen text-neutral-900" style={{ backgroundColor: BG }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: labels.title,
        url: `${BASE_URL}/categories`,
        description: tMeta("description"),
        hasPart: hierarchy.slice(0, 20).map((n) => ({ "@type": "Thing", name: n.name, url: `${BASE_URL}/categories/${n.id}` })),
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Swypik", item: BASE_URL },
          { "@type": "ListItem", position: 2, name: labels.title, item: `${BASE_URL}/categories` },
        ],
      }) }} />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{labels.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {hierarchy.reduce((s, n) => s + (n.count ?? 0), 0)} {labels.products}
          </p>
        </header>

        {hierarchy.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-500">
            {labels.empty}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hierarchy.map((dept) => (
              <section
                key={dept.id}
                className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
              >
                <Link href={`/categories/${dept.id}`} className="block focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none rounded-lg">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-medium" style={{ color: ACCENT }}>
                      {dept.name}
                    </h2>
                    <span className="text-sm text-neutral-500">{dept.count ?? 0}</span>
                  </div>
                </Link>

                {Array.isArray(dept.children) && dept.children.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {dept.children.slice(0, 8).map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/categories/${child.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-2.5 min-h-[44px] text-xs text-neutral-700 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
                        >
                          <span>{child.name}</span>
                          {child.count != null && (
                            <span className="text-neutral-600">({child.count})</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
