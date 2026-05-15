// next-intl request config: încarcă locale-ul din cookie `swypik_locale`,
// fallback la `Accept-Language`, apoi la default.
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  isLocale,
  type Locale,
} from "./config";

function parseAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim().toLowerCase() ?? "";
  const code = first.slice(0, 2);
  return (LOCALES as readonly string[]).includes(code) ? (code as Locale) : null;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const headerLocale = parseAcceptLanguage(headerStore.get("accept-language"));

  const locale: Locale = isLocale(cookieLocale)
    ? cookieLocale
    : headerLocale ?? DEFAULT_LOCALE;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: "Europe/Bucharest",
  };
});
