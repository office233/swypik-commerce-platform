"use client";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import PosterCard from "./PosterCard";
import { MOVIES_DISPLAY_CLASS } from "./fonts";
import { genreLabelKey } from "@/lib/movies/genres";
import type { HomeRow } from "@/lib/movies/home";
import type { SeriesDto } from "@/lib/movies/types";

export function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-5 text-[15px] font-bold text-white/90">{title}</h2>
      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">{children}</div>
    </section>
  );
}

/** Top 10 cu cifre mari conturate (stilul Netflix), cifra ocupă jumătatea stângă a cardului. */
function TopTenCard({ series, rank }: { series: SeriesDto; rank: number }) {
  return (
    <Link href={`/movies/${series.slug}`} className="group relative flex w-[50vw] max-w-[210px] shrink-0 snap-start items-end">
      <span
        aria-hidden
        className={`${MOVIES_DISPLAY_CLASS} pointer-events-none -mr-5 select-none text-[120px] sm:text-[140px] leading-[0.8] text-black drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]`}
        style={{ WebkitTextStroke: "2.5px rgba(255,255,255,0.7)" }}
      >
        {rank}
      </span>
      <div className="relative z-10 aspect-[2/3] w-[34vw] max-w-[140px] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-105 group-active:scale-95 shadow-xl">
        {series.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={series.posterUrl}
            alt={series.title}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-800 to-black flex items-center justify-center p-2 text-center text-xs text-white/50">
            {series.title}
          </div>
        )}
        <span className="absolute right-1.5 top-1.5 rounded bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-black uppercase text-white/90 ring-1 ring-white/20">
          4K
        </span>
      </div>
    </Link>
  );
}

export default function HomeRows({ rows }: { rows: HomeRow[] }) {
  const t = useTranslations("movies");
  return (
    <>
      {rows.map((row) => {
        switch (row.kind) {
          case "continue":
            return (
              <Row key="continue" title={t("continueWatching")}>
                {row.items.map((c) => (
                  <PosterCard key={c.series.id} series={c.series} href={`/movies/${c.series.slug}/${c.episodeNumber}`} progressPct={c.durationMs ? Math.round((c.positionMs / c.durationMs) * 100) : 0} />
                ))}
              </Row>
            );
          case "mylist":
            return <Row key="mylist" title={t("myList")}>{row.items.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}</Row>;
          case "top10":
            return <Row key="top10" title={t("top10Today")}>{row.items.map((s, i) => <TopTenCard key={s.id} series={s} rank={i + 1} />)}</Row>;
          case "originals":
            return <Row key="originals" title={t("originals")}>{row.items.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}</Row>;
          case "latest":
            return <Row key="latest" title={t("newReleases")}>{row.items.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}</Row>;
          case "genre":
            return <Row key={`genre-${row.genre}`} title={t(genreLabelKey(row.genre))}>{row.items.map((s) => <PosterCard key={s.id} series={s} href={`/movies/${s.slug}`} />)}</Row>;
        }
      })}
    </>
  );
}
