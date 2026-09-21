"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import HeroTrailer from "@/components/movies/HeroTrailer";
import PosterCard from "@/components/movies/PosterCard";
import type { SeriesDto } from "@/lib/movies/types";

type Catalog = {
  items: SeriesDto[];
  continueWatching: Array<{ series: SeriesDto; episodeNumber: number; positionMs: number; durationMs: number | null }>;
  nextPage: number | null;
};

const TOP_RANK_COUNT = 10;

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 px-5 text-base font-black uppercase tracking-wider text-white/90">{title}</h2>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">{children}</div>
    </section>
  );
}

async function fetchCatalog(sort: "trending" | "new"): Promise<Catalog> {
  const res = await fetch(`/api/movies?sort=${sort}`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function MoviesClient() {
  const t = useTranslations("movies");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [fresh, setFresh] = useState<SeriesDto[]>([]);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([fetchCatalog("trending"), fetchCatalog("new")])
      .then(([trending, latest]) => {
        setCatalog(trending);
        setFresh(latest.items);
      })
      .catch(() => setError(true));
  }, []);

  const featured = catalog?.items[0] ?? null;
  useEffect(() => {
    if (!featured) return;
    // Ep. 1 e gratuit ⇒ play întoarce URL-ul public direct; îl folosim ca trailer.
    fetch(`/api/movies/${featured.slug}/episodes/1/play`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHeroUrl(d?.playbackUrl ?? null))
      .catch(() => setHeroUrl(null));
  }, [featured]);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-black text-white/70">{t("loadError")}</div>;

  return (
    <main className="min-h-screen bg-black pb-16 text-white">
      <Link
        href="/"
        aria-label={t("back")}
        className="fixed left-4 z-30 rounded-full bg-black/50 p-2.5 text-white ring-1 ring-white/15 backdrop-blur"
        style={{ top: "max(16px, env(safe-area-inset-top))" }}
      >
        <ArrowLeft size={20} />
      </Link>
      {featured ? (
        <HeroTrailer series={featured} playbackUrl={heroUrl} />
      ) : (
        <div className="flex h-[60vh] items-end px-5 pb-8">
          <div>
            <h1 className="text-4xl font-black">{t("title")}</h1>
            <p className="mt-2 text-sm text-white/60">{t("tagline")}</p>
          </div>
        </div>
      )}
      {catalog && catalog.items.length === 0 && <p className="px-5 pt-6 text-white/60">{t("empty")}</p>}
      {catalog && catalog.continueWatching.length > 0 && (
        <Row title={t("continueWatching")}>
          {catalog.continueWatching.map((c) => (
            <PosterCard
              key={c.series.id}
              series={c.series}
              href={`/movies/${c.series.slug}/${c.episodeNumber}`}
              progressPct={c.durationMs ? Math.round((c.positionMs / c.durationMs) * 100) : 0}
            />
          ))}
        </Row>
      )}
      {catalog && catalog.items.length > 0 && (
        <Row title={t("trending")}>
          {catalog.items.slice(0, TOP_RANK_COUNT).map((s, i) => (
            <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} rank={i + 1} />
          ))}
        </Row>
      )}
      {fresh.length > 0 && (
        <Row title={t("newReleases")}>
          {fresh.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}
        </Row>
      )}
    </main>
  );
}
