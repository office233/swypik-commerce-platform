import Link from "next/link";
import { searchAll } from "@/lib/search/query";
import SearchBar from "@/components/search/SearchBar";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; tab?: string };

const ACCENT = "#10A37F";
const BG = "#0D0D0D";

function formatPrice(cents: number | null | undefined) {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams> | SearchParams;
}) {
  // Support both promised (Next 15) and plain (Next 14) variants.
  const params: SearchParams =
    typeof (searchParams as any)?.then === "function"
      ? await (searchParams as Promise<SearchParams>)
      : (searchParams as SearchParams);

  const q = (params.q ?? "").trim();
  const tab = (params.tab ?? "videos") as "videos" | "creators" | "products";

  const tooShort = q.length < 2;
  const results = tooShort
    ? { videos: [], creators: [], products: [] }
    : await searchAll(q).catch(() => ({
        videos: [],
        creators: [],
        products: [],
      }));

  const tabs: Array<{ key: typeof tab; label: string; count: number }> = [
    { key: "videos", label: "Videos", count: results.videos.length },
    { key: "creators", label: "Creators", count: results.creators.length },
    { key: "products", label: "Products", count: results.products.length },
  ];

  return (
    <main
      className="min-h-screen text-white"
      style={{ backgroundColor: BG }}
    >
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold mb-4">Search</h1>

          <form action="/search" method="get" className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search videos, creators, products…"
              className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-[#10A37F]"
              minLength={2}
              autoFocus
            />
            <button
              type="submit"
              className="rounded-lg px-4 py-2 font-medium text-black"
              style={{ backgroundColor: ACCENT }}
            >
              Search
            </button>
          </form>

          <div className="mt-4">
            <SearchBar initialQuery={q} />
          </div>
        </header>

        {tooShort ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-8 text-center text-neutral-400">
            Type at least 2 characters to search.
          </div>
        ) : (
          <>
            <nav className="flex gap-1 border-b border-neutral-800 mb-6">
              {tabs.map((t) => {
                const active = t.key === tab;
                const href = `/search?q=${encodeURIComponent(q)}&tab=${t.key}`;
                return (
                  <Link
                    key={t.key}
                    href={href}
                    className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                    style={{
                      borderColor: active ? ACCENT : "transparent",
                      color: active ? ACCENT : "#d4d4d4",
                    }}
                  >
                    {t.label}{" "}
                    <span className="text-neutral-500">({t.count})</span>
                  </Link>
                );
              })}
            </nav>

            {tab === "videos" && (
              <section>
                {results.videos.length === 0 ? (
                  <EmptyState label={`No videos found for “${q}”`} />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {results.videos.map((v) => (
                      <Link
                        key={v.id}
                        href={`/video/${v.id}`}
                        className="group rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 hover:border-[#10A37F] transition-colors"
                      >
                        <div className="aspect-[9/16] bg-neutral-800 relative">
                          {v.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={v.thumbnail_url}
                              alt={v.title ?? ""}
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="p-2">
                          <div className="text-sm font-medium truncate">
                            {v.title ?? "Untitled"}
                          </div>
                          <div className="text-xs text-neutral-400 truncate">
                            {v.creator_name ?? "—"} ·{" "}
                            {Intl.NumberFormat().format(v.like_count)} likes
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === "creators" && (
              <section>
                {results.creators.length === 0 ? (
                  <EmptyState label={`No creators found for “${q}”`} />
                ) : (
                  <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900/40">
                    {results.creators.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/u/${c.username ?? c.id}`}
                          className="flex items-center gap-3 p-3 hover:bg-neutral-900"
                        >
                          <div className="w-12 h-12 rounded-full bg-neutral-800 overflow-hidden flex-shrink-0">
                            {c.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={c.avatar_url}
                                alt={c.username ?? ""}
                                className="w-full h-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">
                              {c.display_name || c.username || "Creator"}
                            </div>
                            <div className="text-xs text-neutral-400 truncate">
                              @{c.username ?? "unknown"} ·{" "}
                              {Intl.NumberFormat().format(c.follower_count)}{" "}
                              followers
                            </div>
                            {c.bio ? (
                              <div className="text-xs text-neutral-500 truncate mt-1">
                                {c.bio}
                              </div>
                            ) : null}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {tab === "products" && (
              <section>
                {results.products.length === 0 ? (
                  <EmptyState label={`No products found for “${q}”`} />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {results.products.map((p) => (
                      <Link
                        key={p.id}
                        href={`/product/${p.id}`}
                        className="group rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800 hover:border-[#10A37F] transition-colors"
                      >
                        <div className="aspect-square bg-neutral-800 relative">
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.image_url}
                              alt={p.title ?? ""}
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="p-2">
                          <div className="text-sm font-medium truncate">
                            {p.title ?? "Product"}
                          </div>
                          <div
                            className="text-sm font-semibold mt-1"
                            style={{ color: ACCENT }}
                          >
                            {formatPrice(p.price_cents)}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-8 text-center text-neutral-400">
      {label}
    </div>
  );
}
