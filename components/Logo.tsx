import Link from "next/link";

/**
 * Swypik brand mark — violet upward arrow + wordmark.
 * Used in TopBar and profile headers.
 */
export default function Logo({
  href = "/",
  showText = true,
  size = 20,
}: {
  href?: string | null;
  showText?: boolean;
  size?: number;
}) {
  const content = (
    <span className="inline-flex items-center gap-1.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="swypik-arrow-grad" x1="0" y1="24" x2="24" y2="0">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>
        <path
          d="M12 3 L20 13 H15 V21 H9 V13 H4 Z"
          fill="url(#swypik-arrow-grad)"
          stroke="#7C3AED"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      {showText && <span className="text-lg font-black tracking-tight text-white">Swypik</span>}
    </span>
  );
  if (!href) return content;
  return (
    <Link href={href} aria-label="Swypik" className="inline-flex items-center">
      {content}
    </Link>
  );
}
