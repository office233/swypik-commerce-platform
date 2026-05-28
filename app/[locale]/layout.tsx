// Sub-layout pentru rutele user-facing localizate (`app/[locale]/...`).
// Rolul lui: să activeze static rendering pentru paginile dinamice de sub
// `[locale]` și să valideze că `params.locale` este unul cunoscut.
// Layout-ul root (`app/layout.tsx`) se ocupă de <html>, <body>, provider-uri și
// metadata generale — nu duplicăm aici.
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/config";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return <>{children}</>;
}
