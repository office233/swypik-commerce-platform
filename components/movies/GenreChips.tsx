"use client";
import { useTranslations } from "next-intl";
import { MOVIE_GENRES, genreLabelKey, type MovieGenre } from "@/lib/movies/genres";

type Props = { selected: MovieGenre | null; onSelect: (genre: MovieGenre | null) => void };

/** Rândul de categorii (chip-uri) pentru Swypik Cinema. */
export default function GenreChips({ selected, onSelect }: Props) {
  const t = useTranslations("movies");
  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 select-none ${
      active
        ? "bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#EC4899] text-white shadow-[0_0_16px_rgba(124,58,237,0.5)] scale-[1.02]"
        : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white border border-white/10"
    }`;
  return (
    <nav aria-label={t("categories")} className="flex items-center gap-2 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden touch-pan-x">
      <button type="button" onClick={() => onSelect(null)} className={chip(selected === null)}>{t("all")}</button>
      {MOVIE_GENRES.map((g) => (
        <button key={g} type="button" onClick={() => onSelect(g)} className={chip(selected === g)} aria-pressed={selected === g}>
          {t(genreLabelKey(g))}
        </button>
      ))}
    </nav>
  );
}
