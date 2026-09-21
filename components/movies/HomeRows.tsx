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
    <Link href={`/movies/${series.slug}`} className="group relative flex w-[56vw] max-w-[240px] shrink-0 snap-start items-end">
      <span
        aria-hidden
        className={`${MOVIES_DISPLAY_CLASS} pointer-events-none -mr-6 select-none text-[150px] leading-[0.8] text-black`}
        style={{ WebkitTextStroke: "3px rgba(255,255,255,0.75)" }}
      >
        {rank}
      </span>
      <div className="relative z-10 aspect-[9/16] w-[34vw] max-w-[150px] overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-white/10 transition-transform group-active:scale-95">
        {series.posterUrl ? <Image src={series.posterUrl} alt={series.title} fill sizes="34vw" className="object-cover" /> : <div className="absolute inset-0 bg-gradient-to-b from-neutral-700 to-black" />}
        {series.owner.isOfficial && <span className={`${MOVIES_DISPLAY_CLASS} absolute left-1.5 top-1.5 text-[11px] tracking-wider text-[#E50914]`}>S</span>}
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
