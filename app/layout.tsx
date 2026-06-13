import "./globals.css";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
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
    : "https://swypik.com";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Swypik - Descopera, Swipe, Cumpara",
  description: "Platforma de social video commerce. Descopera produse prin clipuri scurte, urmareste creatori si cumpara instant.",
  keywords: "swypik, social commerce, video shopping, romania, produse, oferte, creators, tiktok shopping",
  openGraph: {
    title: "Swypik - Descopera, Swipe, Cumpara",
    description: "Platforma de social video commerce. Descopera produse prin clipuri scurte si cumpara instant.",
    type: "website",
    locale: "ro_RO",
    siteName: "Swypik",
    images: [{ url: "/og-preview.webp", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Swypik - Descopera, Swipe, Cumpara",
    description: "Social video commerce. Swipe, discover, buy.",
    images: ["/og-preview.webp"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7C3AED",
};

import RewardFlash from "@/components/RewardFlash";
import BottomNav from "@/components/BottomNav";
import EmailVerifyBanner from "@/components/auth/EmailVerifyBanner";
import PiLoginButton from "@/components/auth/PiLoginButton";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import PushPrompt from "@/components/notifications/PushPrompt";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import CookieBanner from "@/components/CookieBanner";
// LocaleFab removed: language switch is only available in /account/preferences
import { getTranslations } from "next-intl/server";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("page");
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
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
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://www.youtube-nocookie.com" />
        <link rel="preconnect" href="https://i.ytimg.com" />
        <link rel="preconnect" href="https://www.gstatic.com" />
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
        {/* Pi Network SDK — required for in-PiBrowser authentication / payments.
            Safe outside Pi Browser too (window.Pi just stays undefined for non-Pi UAs). */}
        <script src="https://sdk.minepi.com/pi-sdk.js" async />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": "https://swypik.com/#website",
                  "url": "https://swypik.com/",
                  "name": "Swypik",
                  "description": "Video-first marketplace — discover products through short-form video.",
                  "publisher": { "@id": "https://swypik.com/#organization" },
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                      "@type": "EntryPoint",
                      "urlTemplate": "https://swypik.com/search?q={search_term_string}"
                    },
                    "query-input": "required name=search_term_string"
                  }
                },
                {
                  "@type": "Organization",
                  "@id": "https://swypik.com/#organization",
                  "name": "Swypik",
                  "url": "https://swypik.com/",
                  "logo": "https://swypik.com/apple-touch-icon.png",
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

          {t("sariLaContinut")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <CurrencyProvider initial={currency}>
            {/* Silent Pi Network auto-login: when the app loads inside Pi Browser
                (or with NEXT_PUBLIC_PI_SANDBOX=1), this triggers Pi.authenticate
                and exchanges the token for a Swypik session. Renders no UI. */}
            <PiLoginButton silent redirectTo="" />
            <EmailVerifyBanner />
            <OnboardingGate />
            <div id="main-content" style={{ minHeight: '100dvh' }}>
              {children}
            </div>
            <BottomNav />
            <RewardFlash />
            <PushPrompt />
            <InstallPrompt />
            <CookieBanner />
          </CurrencyProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
