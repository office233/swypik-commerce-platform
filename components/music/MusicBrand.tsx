import Link from "next/link";
import { MOVIES_DISPLAY_CLASS } from "@/components/movies/fonts";

/**
 * Wordmark „SWYPIK MUSIC": alb + violet (`#7C3AED`) cu glow, aceleași litere
 * condensate ca la Movies (`MOVIES_DISPLAY_CLASS` — fontul se importă din
 * `components/movies/fonts`, nu se duplică).
 */
export default function MusicBrand({ href = "/music", size = "md" }: { href?: string; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <Link href={href} aria-label="Swypik Music" className={`${MOVIES_DISPLAY_CLASS} inline-flex items-baseline gap-1 leading-none tracking-wide ${sizeClass}`}>
      <span className="text-white">SWYPIK</span>
      <span className="text-[#7C3AED] drop-shadow-[0_0_12px_rgba(124,58,237,0.55)]">MUSIC</span>
    </Link>
  );
}
