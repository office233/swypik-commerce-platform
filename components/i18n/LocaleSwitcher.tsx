"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { LOCALES, type Locale } from "@/lib/i18n/config";

const LABELS: Record<Locale, string> = { ro: "Română", en: "English" };

export default function LocaleSwitcher({ className }: { className?: string }) {
  const currentLocale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  const handleChange = (locale: Locale) => {
    startTransition(async () => {
      await fetch("/api/i18n/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      // Reîncarcă pentru a aplica catalogul nou (no routing-based locale).
      window.location.reload();
    });
  };

  return (
    <select
      aria-label="Language"
      disabled={isPending}
      value={currentLocale}
      onChange={(e) => handleChange(e.target.value as Locale)}
      className={className}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LABELS[l]}
        </option>
      ))}
    </select>
  );
}
