import { Star } from "lucide-react";

export type StarRatingProps = {
  value: number;
  size?: number;
  className?: string;
  ariaLabel?: string;
};

export default function StarRating({ value, size = 16, className, ariaLabel }: StarRatingProps) {
  const v = Math.max(0, Math.min(5, Number.isFinite(value) ? value : 0));
  const full = Math.floor(v);
  const hasHalf = v - full >= 0.25 && v - full < 0.75;
  const totalFull = hasHalf ? full : Math.round(v);
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className || ""}`}
      role="img"
      aria-label={ariaLabel || `Rating ${v.toFixed(1)} din 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < totalFull;
        const half = !filled && hasHalf && i === full;
        return (
          <Star
            key={i}
            size={size}
            className={filled ? "fill-yellow-400 text-yellow-400" : half ? "fill-yellow-400/40 text-yellow-400" : "text-gray-500"}
            aria-hidden="true"
          />
        );
      })}
    </span>
  );
}
