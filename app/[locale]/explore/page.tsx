/**
 * Explore — RSC shell.
 * Fetches the first feed batch server-side so LCP gets a poster without waiting for JS.
 * Heavy interactive feed lives in ExploreClient.tsx (client component).
 */
import { headers, cookies } from "next/headers";
import type { Metadata } from "next";
import ExploreClient from "./ExploreClient";
import LiveBadge from "@/components/live/LiveBadge";
import { LOCALE_COOKIE, isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { languagesForMetadata } from "@/lib/seo/hreflang";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

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
};

export async function generateMetadata(): Promise<Metadata> {
  const c = await cookies();
  const v = c.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(v) ? v : DEFAULT_LOCALE;
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

async function fetchSeed(category: string): Promise<any[]> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || "https";
    const qs = category ? `&taxonomy_node_slug=${encodeURIComponent(category)}` : "";
    const res = await fetch(`${proto}://${host}/api/explore/feed?limit=30${qs}`, {
      cache: "no-store",
      headers: { cookie: h.get("cookie") || "" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.videos) ? data.videos.slice(0, 30) : [];
  } catch {
    return [];
  }
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = sp.taxonomy_node_slug ?? sp.category ?? "";
  const category = Array.isArray(raw) ? (raw[0] || "") : (raw || "");
  const initialVideos = await fetchSeed(category);
  return (
    <>
      <LiveBadge />
      <ExploreClient initialVideos={initialVideos} initialCategory={category} />
    </>
  );
}
