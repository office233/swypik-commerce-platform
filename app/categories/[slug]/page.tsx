import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { ChevronRight } from "lucide-react";
import {
  LOCALE_COOKIE,
  CURRENCY_COOKIE,
  isLocale,
  isCurrency,
  DEFAULT_LOCALE,
  DEFAULT_CURRENCY,
} from "@/lib/i18n/config";
import { formatCurrency } from "@/lib/i18n/currency";

export const dynamic = "force-dynamic";

type Node = { id: string; name: string; count?: number; kind?: string; children?: Node[] };

type Product = {
  id: string;
  title: string;
  price?: number | null;
  oldPrice?: number | null;
  discountPercent?: number | null;
  images?: string[];
  taxonomyNodeSlug?: string | null;
  hasVideo?: boolean;
};

const BG = "#0D0D0D";
const ACCENT = "#7C3AED";

async function fetchHierarchy(locale: string): Promise<Node[]> {
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
}

async function fetchProducts(slug: string, locale: string): Promise<{ products: Product[]; total: number }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "https";
  const url = `${proto}://${host}/api/products?taxonomy_node_slug=${encodeURIComponent(slug)}&limit=48&includeCount=1&locale=${locale}`;
  const res = await fetch(url, { cache: "no-store", headers: { cookie: h.get("cookie") || "" } });
  if (!res.ok) return { products: [], total: 0 };
  const data = await res.json();
  return { products: Array.isArray(data?.products) ? data.products : [], total: Number(data?.total ?? 0) };
}

function findNodePath(hierarchy: Node[], slug: string, trail: Node[] = []): Node[] | null {
  for (const n of hierarchy) {
    const path = [...trail, n];
    if (n.id === slug) return path;
    if (Array.isArray(n.children)) {
      const found = findNodePath(n.children, slug, path);
      if (found) return found;
    }
  }
  return null;
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const cookieStore = await cookies();
  const cLoc = cookieStore.get(LOCALE_COOKIE)?.value;
  const cCurr = cookieStore.get(CURRENCY_COOKIE)?.value;
  const locale = isLocale(cLoc) ? cLoc : DEFAULT_LOCALE;
  const displayCurrency = isCurrency(cCurr) ? cCurr : DEFAULT_CURRENCY;

  const [hierarchy, { products, total }] = await Promise.all([
    fetchHierarchy(locale),
    fetchProducts(slug, locale),
  ]);

  const path = findNodePath(hierarchy, slug);
  if (!path) notFound();

  const current = path[path.length - 1];
  const children = current.children ?? [];

  const labels =
    locale === "en"
      ? { all: "All categories", products: "products", empty: "No products in this category yet.", subcats: "Subcategories" }
      : locale === "de"
      ? { all: "Alle Kategorien", products: "Produkte", empty: "Noch keine Produkte in dieser Kategorie.", subcats: "Unterkategorien" }
      : locale === "fr"
      ? { all: "Toutes les catégories", products: "produits", empty: "Aucun produit dans cette catégorie.", subcats: "Sous-catégories" }
      : { all: "Toate categoriile", products: "produse", empty: "Niciun produs în această categorie încă.", subcats: "Subcategorii" };

  const fmt = (value: number | null | undefined) =>
    value == null ? "" : formatCurrency(Math.round(value * 100), { locale, displayCurrency, sourceCurrency: "RON" });

  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: BG }}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-neutral-400">
          <Link href="/categories" className="hover:text-white">{labels.all}</Link>
          {path.map((n, i) => (
            <span key={n.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-neutral-600" />
              {i === path.length - 1 ? (
                <span className="text-white">{n.name}</span>
              ) : (
                <Link href={`/categories/${n.id}`} className="hover:text-white">{n.name}</Link>
              )}
            </span>
          ))}
        </nav>

        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{current.name}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {total} {labels.products}
          </p>
        </header>

        {/* Subcategory chips */}
        {children.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
              {labels.subcats}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/categories/${child.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-600 hover:text-white"
                  >
                    <span>{child.name}</span>
                    {child.count != null && (
                      <span className="text-neutral-500">{child.count}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Product grid */}
        {products.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-8 text-center text-neutral-400">
            {labels.empty}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p) => {
              const img = (Array.isArray(p.images) && p.images[0]) || null;
              const discount =
                p.discountPercent && p.discountPercent > 0
                  ? Math.round(p.discountPercent)
                  : p.oldPrice && p.price && p.oldPrice > p.price
                  ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100)
                  : 0;
              return (
                <li key={p.id}>
                  <Link
                    href={`/product/${p.id}`}
                    className="group block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 transition hover:border-neutral-600"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-neutral-950">
                      {img ? (
                        <Image
                          src={img}
                          alt={p.title || ""}
                          fill
                          sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 48vw"
                          className="object-cover transition group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-neutral-600">no image</div>
                      )}
                      {discount > 0 && (
                        <span className="absolute left-2 top-2 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold">
                          -{discount}%
                        </span>
                      )}
                      {p.hasVideo && (
                        <span className="absolute right-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          ▶
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <h3 className="line-clamp-2 text-xs text-neutral-200 sm:text-sm">{p.title}</h3>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-sm font-semibold" style={{ color: ACCENT }}>
                          {fmt(p.price ?? null)}
                        </span>
                        {discount > 0 && (
                          <span className="text-[11px] text-neutral-500 line-through">
                            {fmt(p.oldPrice ?? null)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
