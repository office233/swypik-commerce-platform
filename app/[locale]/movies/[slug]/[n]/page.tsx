import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import PlayerClient from "./PlayerClient";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ slug: string; n: string }> }) {
  if (!isEnabled("movies")) notFound();
  const { slug, n } = await params;
  const episodeNumber = Number(n);
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) notFound();
  return <PlayerClient slug={slug} initialEpisode={episodeNumber} />;
}
