// Sub-layout pentru rutele user-facing localizate (`app/[locale]/...`).
// Roluri:
//   1. activează static rendering pentru paginile dinamice (`setRequestLocale`)
//   2. validează `params.locale`
//   3. expune `generateStaticParams()` pentru build-time render
//   4. setează `alternates.languages` GLOBAL pentru toate paginile descendente
//      (paginile pot suprascrie cu propriul `generateMetadata`)
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { routing } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/config";
import { languagesForMetadata } from "@/lib/seo/hreflang";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Metadata default cu hreflang pentru ROOT-ul fiecărei limbi (`/`, `/en`, etc.).
// Paginile interne (cu propriul `generateMetadata`) trebuie să apeleze
// `languagesForMetadata(pathname)` ca să suprascrie corect.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      languages: languagesForMetadata("/"),
    },
  };
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
