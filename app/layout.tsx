import "./globals.css";

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
    <html lang="ro">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
