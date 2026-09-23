"use client";
import { useTranslations } from "next-intl";
import { MOVIE_GENRES, genreLabelKey, type MovieGenre } from "@/lib/movies/genres";

type Props = { selected: MovieGenre | null; onSelect: (genre: MovieGenre | null) => void };

/** Rândul de categorii (chip-uri) pentru Swypik Cinema. */
export default function GenreChips({ selected, onSelect }: Props) {
  const t = useTranslations("movies");
  const chip = (active: boolean) =>
    `shrink-0 snap-start rounded-full px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${
      active
        ? "bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#EC4899] text-white shadow-[0_0_16px_rgba(124,58,237,0.5)] font-black scale-105"
        : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
    }`;
  return (
    <nav aria-label={t("categories")} className="flex snap-x gap-2 overflow-x-auto px-5 py-2 [scrollbar-width:none]">
      <button type="button" onClick={() => onSelect(null)} className={chip(selected === null)}>{t("all")}</button>
      {MOVIE_GENRES.map((g) => (
        <button key={g} type="button" onClick={() => onSelect(g)} className={chip(selected === g)} aria-pressed={selected === g}>
          {t(genreLabelKey(g))}
        </button>
      ))}
    </nav>
  );
}
