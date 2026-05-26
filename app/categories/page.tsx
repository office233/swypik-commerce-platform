import Link from "next/link";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

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

  const labels =
    locale === "en"
      ? { title: "Categories", browse: "Browse", products: "products", empty: "No categories yet." }
      : locale === "de"
      ? { title: "Kategorien", browse: "Durchsuchen", products: "Produkte", empty: "Noch keine Kategorien." }
      : locale === "fr"
      ? { title: "Catégories", browse: "Parcourir", products: "produits", empty: "Aucune catégorie pour l'instant." }
      : { title: "Categorii", browse: "Răsfoiește", products: "produse", empty: "Nicio categorie încă." };

  return (
    <main className="min-h-screen text-neutral-900" style={{ backgroundColor: BG }}>
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
                            <span className="text-neutral-400">({child.count})</span>
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
