import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "Swypik — Descoperă, Swipe, Cumpără",
  description: "Platforma de social video commerce. Descoperă produse prin clipuri scurte, urmărește creatori, cumpără instant.",
  keywords: "swypik, social commerce, video shopping, romania, produse, oferte, creators, tiktok shopping",
  openGraph: {
    title: "Swypik — Descoperă, Swipe, Cumpără",
    description: "Platforma de social video commerce. Descoperă produse prin clipuri scurte, cumpără instant.",
    type: "website",
    locale: "ro_RO",
    siteName: "Swypik",
    images: [{ url: "/og-preview.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Swypik — Descoperă, Swipe, Cumpără",
    description: "Social video commerce. Swipe, discover, buy.",
    images: ["/og-preview.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={inter.variable}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Swypik" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}

