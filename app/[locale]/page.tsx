import ChatInterface from "@/components/ChatInterface";
import { searchProducts } from "@/lib/db/product-queries";
import { dbQuery } from "@/lib/db";
import type { OfferPost } from "@/lib/types/feed";
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
    let offers: OfferPost[] = [];

    try {
      [trending, bestValue, topRated] = await Promise.all([
        withTimeout(searchProducts({ mode: "trending", limit: 20 }), 8000, emptyResult),
        withTimeout(searchProducts({ mode: "bestvalue", limit: 20 }), 8000, emptyResult),
        withTimeout(searchProducts({ mode: "toprated", limit: 20 }), 8000, emptyResult),
      ]);
    } catch (error) {
      console.error("[Home] Failed to load initial products:", error);
    }

    try {
      const feedResult = await withTimeout(
        searchProducts({ mode: "trending", sort: "popular", limit: 36 }),
        8000,
        emptyResult,
      );
      const candidates = feedResult.products
        .filter((p: any) => {
          const img = Array.isArray(p.images) ? p.images[0] : undefined;
          return p.hasValidPrice && typeof img === "string" && /^https?:\/\//.test(img);
        })
        .slice(0, 12);
      const ids = candidates.map((p: any) => String(p.id));
      let statsMap = new Map<string, { like: number; share: number }>();
      let sellerMap = new Map<string, { verified: boolean; name: string | null }>();
      if (ids.length) {
        const { rows } = await dbQuery(
          `SELECT product_id, like_count, share_count FROM product_stats WHERE product_id = ANY($1::uuid[])`,
          [ids],
        ).catch(() => ({ rows: [] as any[] }));
        statsMap = new Map(rows.map((r: any) => [String(r.product_id), { like: Number(r.like_count) || 0, share: Number(r.share_count) || 0 }]));
        const { rows: sellerRows } = await dbQuery(
          `SELECT p.id AS product_id, s.is_verified, s.name
             FROM marketplace_products p JOIN sellers s ON s.id = p.seller_id
            WHERE p.id = ANY($1::uuid[])`,
          [ids],
        ).catch(() => ({ rows: [] as any[] }));
        sellerMap = new Map(sellerRows.map((r: any) => [String(r.product_id), { verified: Boolean(r.is_verified), name: r.name ?? null }]));
      }
      offers = candidates.map((p: any) => ({
        id: String(p.id),
        title: p.title,
        image: p.images[0],
        price: p.price,
        oldPrice: p.oldPrice,
        discountPercent: p.discountPercent ?? 0,
        currency: "RON",
        rating: p.rating ?? 0,
        orders: p.orders ?? 0,
        brand: sellerMap.get(String(p.id))?.name || p.vendor || p.category || "Swypik",
        category: p.category || "General",
        categoryId: p.categoryId,
        shipFree: Boolean(p.shipFree),
        likeCount: statsMap.get(String(p.id))?.like ?? 0,
        shareCount: statsMap.get(String(p.id))?.share ?? 0,
        viewerLiked: false,
        sellerVerified: sellerMap.get(String(p.id))?.verified ?? false,
      }));
    } catch (error) {
      console.error("[Home] Failed to load offers feed:", error);
    }

    return { trending, bestValue, topRated, offers };
  },
  ["home-product-sections-v2"],
  { revalidate: 120 },
);

export default async function Home() {
  const t = await getTranslations("page");
  const { trending, bestValue, topRated, offers } = await getHomeProductSections();

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
      <ChatInterface
        initialTrending={trending.products}
        initialBestValue={bestValue.products}
        initialTopRated={topRated.products}
        initialOffers={offers}
      />
    </>
  );
}
