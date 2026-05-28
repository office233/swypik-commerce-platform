// next-intl request config: locale resolution order
//   1. cookie `swypik_locale`
//   2. authenticated user's `users.locale` (set in account preferences)
//   3. Accept-Language header
//   4. DEFAULT_LOCALE
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

async function resolveUserLocale(): Promise<Locale | null> {
  try {
    // Lazy-load to avoid pulling DB into client bundles / edge.
    const { getAuthUser } = await import("@/lib/auth/getAuthUser");
    const { dbQuery } = await import("@/lib/db");
    const auth = await getAuthUser();
    if (!auth.userId) return null;
    const { rows } = await dbQuery<{ locale: string | null }>(
      `SELECT locale FROM users WHERE id = $1 LIMIT 1`,
      [auth.userId],
    );
    const v = rows[0]?.locale;
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  let resolved: Locale | null = isLocale(cookieLocale) ? cookieLocale : null;
  if (!resolved) resolved = await resolveUserLocale();
  if (!resolved) resolved = parseAcceptLanguage(headerStore.get("accept-language"));
  const locale: Locale = resolved ?? DEFAULT_LOCALE;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: "Europe/Bucharest",
  };
});
