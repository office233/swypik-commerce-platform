/**
 * Explore — RSC shell.
 * Fetches first 3 videos server-side so LCP gets a poster without waiting for JS.
 * Heavy interactive feed lives in ExploreClient.tsx (client component).
 */
import { headers } from "next/headers";
import ExploreClient from "./ExploreClient";
import LiveBadge from "@/components/live/LiveBadge";

export const dynamic = "force-dynamic";

async function fetchSeed(): Promise<any[]> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || "https";
    const res = await fetch(`${proto}://${host}/api/explore/feed?limit=3`, {
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

export default async function ExplorePage() {
  const initialVideos = await fetchSeed();
  return (
    <>
      <LiveBadge />
      <ExploreClient initialVideos={initialVideos} />
    </>
  );
}
