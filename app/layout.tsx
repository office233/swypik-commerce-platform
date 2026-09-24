import "./globals.css";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import {
  CURRENCY_BY_LOCALE,
  CURRENCY_COOKIE,
  isCurrency,
  type Currency,
  type Locale,
} from "@/lib/i18n/config";
import { CurrencyProvider } from "@/components/i18n/CurrencyProvider";
import { safeJsonLd } from "@/lib/seo/json-ld";

const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const appUrl =
  rawAppUrl && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(rawAppUrl)
    ? rawAppUrl
    : APP_URL;

const OG_LOCALE: Record<string, string> = {
  ro: "ro_RO",
  en: "en_US",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
  pt: "pt_PT",
  it: "it_IT",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "rootMeta" });
  return {
    metadataBase: new URL(appUrl),
    title: t("title"),
    description: t("description"),
    keywords: "swypik, social commerce, video shopping, romania, produse, oferte, creators, tiktok shopping",
    openGraph: {
      title: t("title"),
      description: t("ogDescription"),
      type: "website",
      locale: OG_LOCALE[locale] ?? "ro_RO",
      siteName: "Swypik",
      images: [{ url: "/og-preview.webp", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("twitterDescription"),
      images: ["/og-preview.webp"],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7C3AED",
};

import BottomNav from "@/components/BottomNav";
import MusicPlayerProvider from "@/components/music/MusicPlayerProvider";
import MiniPlayer from "@/components/music/MiniPlayer";
import FxRatesLoader from "@/components/i18n/FxRatesLoader";
import EmailVerifyBanner from "@/components/auth/EmailVerifyBanner";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import PushPrompt from "@/components/notifications/PushPrompt";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar";
import CookieBanner from "@/components/CookieBanner";
import { APP_URL } from "@/lib/app-url";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: "rootMeta" });
  const cookieStore = await cookies();
  const cookieCurrency = cookieStore.get(CURRENCY_COOKIE)?.value;
  const currency: Currency = isCurrency(cookieCurrency)
    ? cookieCurrency
    : CURRENCY_BY_LOCALE[locale] ?? "RON";
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Swypik" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {process.env.GOOGLE_SITE_VERIFICATION ? (
          <meta name="google-site-verification" content={process.env.GOOGLE_SITE_VERIFICATION} />
        ) : null}
        {process.env.BING_SITE_VERIFICATION ? (
          <meta name="msvalidate.01" content={process.env.BING_SITE_VERIFICATION} />
        ) : null}
        {process.env.YANDEX_VERIFICATION ? (
          <meta name="yandex-verification" content={process.env.YANDEX_VERIFICATION} />
        ) : null}
        {process.env.PINTEREST_SITE_VERIFICATION ? (
          <meta name="p:domain_verify" content={process.env.PINTEREST_SITE_VERIFICATION} />
        ) : null}
        {process.env.FACEBOOK_DOMAIN_VERIFICATION ? (
          <meta name="facebook-domain-verification" content={process.env.FACEBOOK_DOMAIN_VERIFICATION} />
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${APP_URL}/#website`,
                  "url": `${APP_URL}/`,
                  "name": "Swypik",
                  "description": "Video-first marketplace — discover products through short-form video.",
                  "publisher": { "@id": `${APP_URL}/#organization` },
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                      "@type": "EntryPoint",
                      "urlTemplate": `${APP_URL}/search?q={search_term_string}`
                    },
                    "query-input": "required name=search_term_string"
                  }
                },
                {
                  "@type": "Organization",
                  "@id": `${APP_URL}/#organization`,
                  "name": "Swypik",
                  "url": `${APP_URL}/`,
                  "logo": `${APP_URL}/apple-touch-icon.png`,
                  "sameAs": []
                }
              ]
            })
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-[#0D0D0D] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <CurrencyProvider initial={currency}>
            <FxRatesLoader />
            <EmailVerifyBanner />
            <OnboardingGate />
            <MusicPlayerProvider>
              <div id="main-content" style={{ minHeight: '100dvh' }}>
                {children}
              </div>
              <MiniPlayer />
              <BottomNav />
            </MusicPlayerProvider>
            <PushPrompt />
            <InstallPrompt />
            <CookieBanner />
            <ServiceWorkerRegistrar />
          </CurrencyProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
