import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { cookies } from "next/headers";
import { formatCurrency } from "@/lib/i18n/currency";
import {
  CURRENCY_COOKIE,
  LOCALE_COOKIE,
  isCurrency,
  isLocale,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
} from "@/lib/i18n/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop — Swypik" };

type Row = {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  price_cents: number | null;
  compare_at_price_cents: number | null;
  currency: string;
  taxonomy_category: string | null;
};

const PAGE_SIZE = 24;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const cat = (sp.cat || "").trim();

  const cookieStore = await cookies();
  const cCurr = cookieStore.get(CURRENCY_COOKIE)?.value;
  const cLoc = cookieStore.get(LOCALE_COOKIE)?.value;
  const displayCurrency = isCurrency(cCurr) ? cCurr : DEFAULT_CURRENCY;
  const locale = isLocale(cLoc) ? cLoc : DEFAULT_LOCALE;

  const where: string[] = ["status = 'active'", "is_adult = false"];
  const params: unknown[] = [];
  if (cat) {
    params.push(cat);
    where.push(`taxonomy_slug = $${params.length}`);
  }
  params.push(PAGE_SIZE);
  params.push((page - 1) * PAGE_SIZE);

  const { rows } = await dbQuery<Row>(
    `SELECT id, slug, title, image_url, price_cents, compare_at_price_cents, currency, taxonomy_category
       FROM marketplace_products
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const fmt = (cents: number | null | undefined, srcCur: string) =>
    cents == null
      ? ""
      : formatCurrency(cents, { locale, displayCurrency, sourceCurrency: srcCur as any });

  return (
    <main className="min-h-screen bg-[#0D0D0D] text-white pb-24">
      <header className="sticky top-0 z-10 bg-[#0D0D0D]/90 backdrop-blur border-b border-white/10 px-4 py-4">
        <h1 className="text-2xl font-black">Shop</h1>
        <p className="text-sm text-white/60 mt-1">
          {cat ? `Categorie: ${cat}` : "Descoperă produse curate"}
        </p>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-white/60">
            Nu am găsit produse{cat ? ` în ${cat}` : ""}.
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/product/${p.id}`}
                    className="group block rounded-2xl bg-white/[0.03] border border-white/5 overflow-hidden hover:border-[#7C3AED]/50 transition"
                  >
                    <div className="aspect-square bg-white/5 overflow-hidden">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/30 text-3xl">📦</div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-xs text-white/40 mb-1">{p.taxonomy_category || "—"}</div>
                      <div className="text-sm font-semibold line-clamp-2 min-h-[2.5rem]">{p.title}</div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-base font-black">
                          {fmt(p.price_cents, p.currency)}
                        </span>
                        {p.compare_at_price_cents && p.compare_at_price_cents > (p.price_cents || 0) ? (
                          <span className="text-xs text-white/40 line-through">
                            {fmt(p.compare_at_price_cents, p.currency)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <nav className="mt-8 flex items-center justify-center gap-3">
              {page > 1 ? (
                <Link
                  href={`/shop?${cat ? `cat=${encodeURIComponent(cat)}&` : ""}page=${page - 1}`}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                >
                  ← Anterior
                </Link>
              ) : null}
              <span className="text-sm text-white/50">Pagina {page}</span>
              {rows.length === PAGE_SIZE ? (
                <Link
                  href={`/shop?${cat ? `cat=${encodeURIComponent(cat)}&` : ""}page=${page + 1}`}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                >
                  Următor →
                </Link>
              ) : null}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}
