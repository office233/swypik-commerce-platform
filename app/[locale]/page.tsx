import ChatInterface from "@/components/ChatInterface";
import { searchProducts } from "@/lib/db/product-queries";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { getTranslations } from "next-intl/server";
import { safeJsonLd } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

const OG_LOCALE: Record<string, string> = {
  ro: "ro_RO",
  en: "en_US",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
  pt: "pt_PT",
  it: "it_IT",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  const canonical = locale === "ro" ? "https://swypik.com/" : `https://swypik.com/${locale}`;
  return {
    title: t("homeTitle"),
    description: t("homeDescription"),
    alternates: {
      canonical,
      languages: languagesForMetadata("/"),
    },
    openGraph: {
      title: t("homeOgTitle"),
      description: t("homeOgDescription"),
      url: canonical,
      siteName: "Swypik",
      type: "website",
      locale: OG_LOCALE[locale] ?? "en_US",
      images: [{ url: "/og-preview.webp", width: 1200, height: 630, alt: t("homeOgTitle") }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("homeTwitterTitle"),
      description: t("homeTwitterDescription"),
      images: ["/og-preview.webp"],
    },
  };
}

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
        dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(orgJsonLd) }}
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
      <ChatInterface
        initialTrending={trending.products}
        initialBestValue={bestValue.products}
        initialTopRated={topRated.products}
      />
    </>
  );
}
