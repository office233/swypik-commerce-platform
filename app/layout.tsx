import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "AICeVrei.ro — Shopping inteligent cu AI",
  description: "Spune-mi ce vrei și îți găsesc cea mai bună ofertă. Produse verificate, prețuri corecte, livrare în România.",
  keywords: "shopping, ai, romania, produse, oferte, reduceri, gadgets, tech, beauty",
  openGraph: {
    title: "AICeVrei.ro — Shopping inteligent cu AI",
    description: "Caut produse, compar prețuri, explic detalii — totul într-o conversație cu AI.",
    type: "website",
    locale: "ro_RO",
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
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/icon-192.png" type="image/png" />
      </head>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
