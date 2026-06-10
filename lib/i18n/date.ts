import { DEFAULT_LOCALE, type Locale } from "./config";

const LOCALE_TO_BCP47: Record<Locale, string> = {
  ro: "ro-RO",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  it: "it-IT",
  pt: "pt-PT",
  es: "es-ES",
};

const TIMEZONE = "Europe/Bucharest";

function toBcp47(locale?: string | null): string {
  if (locale && locale in LOCALE_TO_BCP47) return LOCALE_TO_BCP47[locale as Locale];
  return LOCALE_TO_BCP47[DEFAULT_LOCALE];
}

export function formatDate(
  date: Date | string | number | null | undefined,
  locale?: string | null,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
): string {
  if (date == null) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(toBcp47(locale), { timeZone: TIMEZONE, ...options });
}

export function formatDateTime(
  date: Date | string | number | null | undefined,
  locale?: string | null,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" },
): string {
  if (date == null) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(toBcp47(locale), { timeZone: TIMEZONE, ...options });
}
