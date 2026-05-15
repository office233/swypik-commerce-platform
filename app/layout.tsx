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
    images: [{ url: "/og-preview.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Swypik - Descopera, Swipe, Cumpara",
    description: "Social video commerce. Swipe, discover, buy.",
    images: ["/og-preview.png"],
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
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import PushPrompt from "@/components/notifications/PushPrompt";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import CookieBanner from "@/components/CookieBanner";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <CurrencyProvider initial={currency}>
            <EmailVerifyBanner />
            <OnboardingGate />
            <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 56px)', minHeight: '100dvh' }}>
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
