"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import HeroTrailer from "@/components/movies/HeroTrailer";
import PosterCard from "@/components/movies/PosterCard";
import GenreChips from "@/components/movies/GenreChips";
import HomeRows from "@/components/movies/HomeRows";
import MoviesBrand from "@/components/movies/MoviesBrand";
import { moviesDisplayFont } from "@/components/movies/fonts";
import type { HomeRow } from "@/lib/movies/home";
import type { MovieGenre } from "@/lib/movies/genres";
import type { SeriesDto } from "@/lib/movies/types";

type Home = { featured: SeriesDto | null; rows: HomeRow[] };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function MoviesClient() {
  const t = useTranslations("movies");
  const [home, setHome] = useState<Home | null>(null);
  const [genre, setGenre] = useState<MovieGenre | null>(null);
  const [genreItems, setGenreItems] = useState<SeriesDto[] | null>(null);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getJson<Home>("/api/movies/home").then(setHome).catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!genre) { setGenreItems(null); return; }
    setGenreItems(null);
    getJson<{ items: SeriesDto[] }>(`/api/movies?genre=${genre}&sort=trending`).then((d) => setGenreItems(d.items)).catch(() => setGenreItems([]));
  }, [genre]);

  const featured = home?.featured ?? null;
  useEffect(() => {
    if (!featured) return;
    // Ep. 1 e gratuit ⇒ play întoarce URL-ul public direct; îl folosim ca trailer.
    getJson<{ playbackUrl: string }>(`/api/movies/${featured.slug}/episodes/1/play`).then((d) => setHeroUrl(d.playbackUrl)).catch(() => setHeroUrl(null));
  }, [featured]);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-black text-white/70">{t("loadError")}</div>;

  return (
    <main className={`${moviesDisplayFont.variable} min-h-screen bg-[#07070A] pb-24 text-white`}>
      {/* Sticky Header cu fundal opac și backdrop blur — elimină orice suprapunere haotică la scroll */}
      <header className="sticky top-0 z-40 bg-[#07070A]/95 backdrop-blur-xl border-b border-white/10" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between gap-3 px-4 pb-2">
          <div className="flex items-center gap-2.5">
            <Link href="/" aria-label={t("back")} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 active:scale-95 transition-all">
              <ArrowLeft size={18} />
            </Link>
            <MoviesBrand size="sm" />
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7C3AED]/20 to-[#EC4899]/20 border border-[#7C3AED]/40 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-pink-300">
            {t("cinemaBadge")}
          </span>
        </div>
        <GenreChips selected={genre} onSelect={setGenre} />
      </header>

      {genre ? (
        <section className="px-4 pt-5 pb-8">
          {genreItems === null ? null : genreItems.length === 0 ? (
            <p className="text-white/60 text-sm py-12 text-center">{t("emptyGenre")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {genreItems.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}
            </div>
          )}
        </section>
      ) : (
        <>
          {featured ? <HeroTrailer series={featured} playbackUrl={heroUrl} /> : (
            <div className="flex h-[50vh] items-end px-5 pb-8">
              <div>
                <MoviesBrand size="lg" />
                <p className="mt-3 text-sm text-white/60">{home ? t("empty") : ""}</p>
              </div>
            </div>
          )}
          {home && <HomeRows rows={home.rows} />}
        </>
      )}
    </main>
  );
}
