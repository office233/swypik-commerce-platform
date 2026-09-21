"use client";
import Link from "next/link";
import Image from "next/image";
import type { SeriesDto } from "@/lib/movies/types";

const PROGRESS_MIN_VISIBLE_PCT = 2;

export default function PosterCard({ series, href, progressPct, rank }: { series: SeriesDto; href: string; progressPct?: number; rank?: number }) {
  return (
    <Link href={href} className="group relative block w-[42vw] max-w-[180px] shrink-0 snap-start">
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10 transition-transform duration-300 group-active:scale-95 group-hover:scale-[1.03]">
        {series.posterUrl ? (
          <Image src={series.posterUrl} alt={series.title} fill sizes="42vw" className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-700 to-black" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent" />
        {rank !== undefined && (
          <span
            className="absolute -left-1 bottom-2 text-[64px] font-black leading-none text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
            style={{ WebkitTextStroke: "2px rgba(255,255,255,0.35)" }}
          >
            {rank}
          </span>
        )}
        {series.isAdult && <span className="absolute right-2 top-2 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">18+</span>}
        {progressPct !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-red-500" style={{ width: `${Math.min(100, Math.max(PROGRESS_MIN_VISIBLE_PCT, progressPct))}%` }} />
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] font-bold leading-tight text-white">{series.title}</p>
    </Link>
  );
}
