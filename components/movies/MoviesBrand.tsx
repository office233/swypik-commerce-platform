import Link from "next/link";
import { MOVIES_DISPLAY_CLASS } from "./fonts";

/** Wordmark „SWYPIK MOVIES": identitate proprie Swypik cu gradient violet/pink și tipografie modernă. */
export default function MoviesBrand({ href = "/movies", size = "md" }: { href?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "text-3xl sm:text-4xl" : size === "sm" ? "text-lg sm:text-xl" : "text-xl sm:text-2xl";
  return (
    <Link href={href} aria-label="Swypik Movies" className="inline-flex items-center gap-1.5 leading-none tracking-tight font-black select-none">
      <span className={`text-white font-extrabold ${sizeClass}`}>SWYPIK</span>
      <span className={`bg-gradient-to-r from-[#7C3AED] via-[#A855F7] to-[#EC4899] bg-clip-text text-transparent drop-shadow-[0_0_16px_rgba(124,58,237,0.5)] font-black tracking-wider ${sizeClass}`}>
        MOVIES
      </span>
      <span className="rounded bg-gradient-to-r from-[#7C3AED] to-[#EC4899] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-sm ml-0.5">
        CINEMA
      </span>
    </Link>
  );
}
