import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/feature-flags";
import { getSeriesBySlug } from "@/lib/movies/repository";
import SeriesClient from "./SeriesClient";

export const dynamic = "force-dynamic";

const DESCRIPTION_MAX = 160;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const series = await getSeriesBySlug(slug).catch(() => null);
  if (!series || series.status !== "published") return {};
  return {
    title: `${series.title} — Swypik Movies`,
    description: series.synopsis.slice(0, DESCRIPTION_MAX),
    openGraph: { images: series.poster_url ? [series.poster_url] : [] },
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isEnabled("movies")) notFound();
  const { slug } = await params;
  return <SeriesClient slug={slug} />;
}
