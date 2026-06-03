"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
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

/**
 * Compact globe button → dropdown with all locales.
 * Persists choice via /api/i18n/preferences (cookie + DB if user logged in).
 */
export default function LocaleQuickPicker({ className = "" }: { className?: string }) {
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (loc: Locale) => {
    setOpen(false);
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
      router.refresh();
    });
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="Language"
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        <Globe className="h-5 w-5" />
        <span className="absolute -bottom-0.5 -right-0.5 text-[10px] leading-none">
          {META[currentLocale]?.flag}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-white/10 bg-black/95 shadow-lg backdrop-blur-xl z-50 py-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => pick(l)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 ${
                l === currentLocale ? "text-white font-medium" : "text-white/80"
              }`}
            >
              <span>{META[l].flag}</span>
              <span>{META[l].label}</span>
              {l === currentLocale && <span className="ml-auto text-xs text-emerald-400">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
