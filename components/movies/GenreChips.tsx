"use client";
import { useTranslations } from "next-intl";
import { MOVIE_GENRES, genreLabelKey, type MovieGenre } from "@/lib/movies/genres";

type Props = { selected: MovieGenre | null; onSelect: (genre: MovieGenre | null) => void };

/** Rândul de categorii (chip-uri), echivalentul meniului „Categorii" de la Netflix pe mobil. */
export default function GenreChips({ selected, onSelect }: Props) {
  const t = useTranslations("movies");
  const chip = (active: boolean) =>
    `shrink-0 snap-start rounded-full px-3.5 py-1.5 text-xs font-bold ring-1 transition active:scale-95 ${
      active ? "bg-white text-black ring-white" : "bg-white/5 text-white/80 ring-white/15 hover:bg-white/10"
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
