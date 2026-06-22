import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import PiAppInit from "./PiAppInit";
import PiNav from "./PiNav";

/**
 * Pi-only app shell (served at pi.swypik.com, rewritten to /pi by middleware).
 *
 * This is a deliberately minimal, self-contained experience that complies
 * with Pi Mainnet listing rules:
 *   - Pi authentication only (no email/Google/Apple)
 *   - Pi payments only (no Stripe / fiat)
 *   - no outbound links to external sites
 *   - minimal data collection
 *
 * It shares the same backend (products, orders) as the main site but never
 * exposes the fiat/Stripe surfaces.
 */

export const metadata: Metadata = {
  title: "Swypik — Shop with Pi",
  description: "Discover products and pay with Pi. A Pi Network marketplace.",
  robots: { index: false, follow: false },
};

export default function PiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      {/* Pi SDK */}
      <Script src="https://sdk.minepi.com/pi-sdk.js" strategy="beforeInteractive" />
      {/* Inits the Pi SDK and auto-triggers auth (scope "username",
          verified server-side via /v2/me). */}
      <PiAppInit />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0D0D0D]/90 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between">
          <Link href="/pi" className="text-lg font-black tracking-tight">
            Swypik
          </Link>
          <span className="rounded-full bg-[#7D4698]/20 px-3 py-1 text-xs font-bold text-[#C9A2DC]">
            π Pi Network
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-screen-sm px-4 pb-24 pt-4">{children}</main>
      <PiNav />
    </div>
  );
}
