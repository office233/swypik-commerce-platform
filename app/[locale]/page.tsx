import ChatInterface from "@/components/ChatInterface";
import { searchProducts } from "@/lib/db/product-queries";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

export const metadata: Metadata = {
  title: "Swypik — Cumpără prin Video | Marketplace cu AI",
  description:
    "Discover and buy products through curated video content. Browse trending items, best-value deals and top-rated picks with AI-powered recommendations on Swypik.",
  alternates: {
    canonical: "https://swypik.com/",
    languages: languagesForMetadata("/"),
  },
  openGraph: {
    title: "Swypik — Cumpără prin Video",
    description:
      "AI-powered video marketplace. Trending products, best deals and top-rated picks — all through video.",
    url: "https://swypik.com/",
    siteName: "Swypik",
    type: "website",
    locale: "ro_RO",
    images: [{ url: "/og-preview.webp", width: 1200, height: 630, alt: "Swypik — Cumpără prin Video" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Swypik — Shop by Video",
    description: "AI-powered video marketplace.",
    images: ["/og-preview.webp"],
  },
};

type ProductSearchResult = Awaited<ReturnType<typeof searchProducts>>;

const emptyResult: ProductSearchResult = { products: [], total: 0, offset: 0, limit: 0, hasMore: false };

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const getHomeProductSections = unstable_cache(
  async () => {
    let trending = emptyResult;
    let bestValue = emptyResult;
    let topRated = emptyResult;

    try {
      [trending, bestValue, topRated] = await Promise.all([
        withTimeout(searchProducts({ mode: "trending", limit: 20 }), 8000, emptyResult),
        withTimeout(searchProducts({ mode: "bestvalue", limit: 20 }), 8000, emptyResult),
        withTimeout(searchProducts({ mode: "toprated", limit: 20 }), 8000, emptyResult),
      ]);
    } catch (error) {
      console.error("[Home] Failed to load initial products:", error);
    }

    return { trending, bestValue, topRated };
  },
  ["home-product-sections-v1"],
  { revalidate: 120 },
);

export default async function Home() {
  const t = await getTranslations("page");
  const { trending, bestValue, topRated } = await getHomeProductSections();

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Swypik",
    url: "https://swypik.com/",
    description:
      "AI-powered video marketplace. Shop trending, best-value and top-rated products through curated video.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://swypik.com/search?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Swypik",
    url: "https://swypik.com/",
    logo: "https://swypik.com/icon.png",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <header className="sr-only">
        <h1>{t("swypikCumparaPrinVideo")}</h1>
        <p>
          
          {t("descoperaProdusePopulareOferte")}
        </p>
        <h2>Produse populare</h2>
        <h2>{t("calitatepretExcelent")}</h2>
        <h2>Top apreciate</h2>
      </header>
      {/* Swypik Fly — entry point vizibil pe home */}
      <a
        href="/fly"
        className="fixed right-4 top-16 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition active:scale-95"
      >
        ✈️ Fly
      </a>
      <ChatInterface
        initialTrending={trending.products}
        initialBestValue={bestValue.products}
        initialTopRated={topRated.products}
      />
    </>
  );
}
