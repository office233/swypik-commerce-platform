/**
 * Explore — RSC shell (metadata + ecran imersiv). Feed-ul interactiv: ExploreClient.tsx
 * → components/explore/FeedScreen.tsx.
 */
import type { Metadata } from "next";
import ExploreClient from "./ExploreClient";
import LiveBadge from "@/components/live/LiveBadge";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { languagesForMetadata } from "@/lib/seo/hreflang";
import { getAppBaseUrl } from "@/lib/url";
import ImmersiveSurface from "@/components/theme/ImmersiveSurface";

export const dynamic = "force-dynamic";

const BASE_URL = getAppBaseUrl();

const META_BY_LOCALE: Record<string, { title: string; description: string }> = {
  ro: {
    title: "Explore — Descoperă produse prin video | Swypik",
    description: "Swipe prin sute de clipuri scurte cu produse curate de AI. Cumpără direct din video, fără să te complici.",
  },
  en: {
    title: "Explore — Shop by video | Swypik",
    description: "Swipe through hundreds of short curated videos. Buy products directly from the feed — no friction.",
  },
  de: {
    title: "Explore — Shopping per Video | Swypik",
    description: "Wische durch kuratierte Kurzvideos und kaufe Produkte direkt aus dem Feed.",
  },
  fr: {
    title: "Explore — Shopping vidéo | Swypik",
    description: "Découvrez des produits via des vidéos courtes curatées. Achetez directement depuis le feed.",
  },
  es: {
    title: "Explore — Compra por video | Swypik",
    description: "Desliza por cientos de videos cortos curados por IA. Compra directamente desde el feed, sin complicaciones.",
  },
  pt: {
    title: "Explore — Compre por vídeo | Swypik",
    description: "Deslize por centenas de vídeos curtos selecionados por IA. Compre diretamente do feed, sem complicações.",
  },
  it: {
    title: "Explore — Fai shopping tramite video | Swypik",
    description: "Scorri centinaia di brevi video selezionati dall'IA. Acquista direttamente dal feed, senza complicazioni.",
  },
};

// Bug fix (i18n/UI audit 2026-09-24): metadata previously read the locale
// cookie instead of the route's own [locale] segment, so /en/explore could
// render the Romanian <title> whenever the cookie was stale or unset.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const meta = META_BY_LOCALE[locale] ?? META_BY_LOCALE.ro;
  const canonical = `${BASE_URL}/explore`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical, languages: languagesForMetadata("/explore") },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
      siteName: "Swypik",
      type: "website",
      images: [{ url: "/og-preview.webp", width: 1200, height: 630, alt: "Swypik Explore" }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: ["/og-preview.webp"],
    },
  };
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = sp.taxonomy_node_slug ?? sp.category ?? "";
  const category = Array.isArray(raw) ? (raw[0] || "") : (raw || "");
  // Clipurile se încarcă pe client (lib/feed/client/feed-source.ts): seen-set și
  // snapshot-ul de ranking sunt per viewer, deci nu au ce căuta în HTML-ul randat.
  return (
    <>
      <LiveBadge />
      <ImmersiveSurface fullscreen>
        <ExploreClient initialCategory={category} />
      </ImmersiveSurface>
    </>
  );
}
