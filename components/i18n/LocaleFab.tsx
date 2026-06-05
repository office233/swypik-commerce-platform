"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Globe, Check } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/i18n/config";

const META: Record<Locale, { label: string; flag: string }> = {
  ro: { label: "Română", flag: "🇷🇴" },
  en: { label: "English", flag: "🇬🇧" },
  es: { label: "Español", flag: "🇪🇸" },
  fr: { label: "Français", flag: "🇫🇷" },
  de: { label: "Deutsch", flag: "🇩🇪" },
  pt: { label: "Português", flag: "🇵🇹" },
  it: { label: "Italiano", flag: "🇮🇹" },
};

// Pagini full-immersive unde nu vrem FAB peste conținut.
const HIDDEN_PREFIXES = [
  "/reels",
  "/checkout",
  "/auth",
  "/admin",
  "/seller",
  "/creator",
  "/r/",
];

/**
 * Floating language picker — globally mounted, top-right.
 * Persists choice via /api/i18n/preferences (cookie + DB if logged in)
 * then router.refresh() to swap all server-rendered strings.
 */
export default function LocaleFab() {
  const currentLocale = useLocale() as Locale;
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Strip locale prefix for hidden-path check (e.g. "/en/reels" → "/reels")
  const localeStripped = pathname.replace(/^\/(?:en|es|fr|de|pt|it)(?=\/|$)/, "") || "/";
  const isHidden = HIDDEN_PREFIXES.some((p) => localeStripped.startsWith(p));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isHidden) return null;

  const pick = (loc: Locale) => {
    setOpen(false);
    if (loc === currentLocale) return;
    startTransition(async () => {
      try {
        await fetch("/api/i18n/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: loc }),
        });
      } catch {
        document.cookie = `swypik_locale=${loc}; Path=/; Max-Age=31536000; SameSite=Lax`;
      }
      // Hard reload guarantees ALL server components + middleware re-resolve
      // the locale cookie. router.refresh() alone leaves client cache stale
      // on routes with client islands.
      window.location.reload();
    });
  };

  return (
    <div
      ref={ref}
      className="fixed z-[60] pointer-events-none"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        right: "12px",
      }}
    >
      <div className="pointer-events-auto">
        <button
          type="button"
          aria-label="Change language"
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={isPending}
          onClick={() => setOpen((v) => !v)}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-md ring-1 ring-white/20 shadow-lg hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/60 transition disabled:opacity-60"
        >
          <Globe className="h-5 w-5" />
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 text-[11px] leading-none drop-shadow"
          >
            {META[currentLocale]?.flag}
          </span>
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Language"
            className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-black/95 shadow-2xl backdrop-blur-xl py-1"
          >
            {LOCALES.map((l) => {
              const isCurrent = l === currentLocale;
              return (
                <button
                  key={l}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  onClick={() => pick(l)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-white/10 transition ${
                    isCurrent ? "text-white font-semibold" : "text-white/80"
                  }`}
                >
                  <span className="text-lg leading-none">{META[l].flag}</span>
                  <span className="flex-1">{META[l].label}</span>
                  {isCurrent && <Check className="h-4 w-4 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
