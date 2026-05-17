/**
 * Explore — RSC shell.
 * Fetches first 3 videos server-side so LCP gets a poster without waiting for JS.
 * Heavy interactive feed lives in ExploreClient.tsx (client component).
 */
import { headers } from "next/headers";
import ExploreClient from "./ExploreClient";
import LiveBadge from "@/components/live/LiveBadge";

export const dynamic = "force-dynamic";

async function fetchSeed(category: string): Promise<any[]> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || "https";
    const qs = category ? `&taxonomy_node_slug=${encodeURIComponent(category)}` : "";
    const res = await fetch(`${proto}://${host}/api/explore/feed?limit=3${qs}`, {
      cache: "no-store",
      headers: { cookie: h.get("cookie") || "" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.videos) ? data.videos.slice(0, 3) : [];
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
