import Link from "next/link";
import { MOVIES_DISPLAY_CLASS } from "./fonts";

/** Wordmark „SWYPIK MOVIES": roșu Swypik pe negru, litere condensate, ca un logo de streaming. */
export default function MoviesBrand({ href = "/movies", size = "md" }: { href?: string; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <Link href={href} aria-label="Swypik Movies" className={`${MOVIES_DISPLAY_CLASS} inline-flex items-baseline gap-1 leading-none tracking-wide ${sizeClass}`}>
      <span className="text-white">SWYPIK</span>
      <span className="text-[#E50914] drop-shadow-[0_0_12px_rgba(229,9,20,0.45)]">MOVIES</span>
    </Link>
  );
}
