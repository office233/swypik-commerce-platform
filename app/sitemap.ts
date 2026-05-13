/**
 * Dynamic Sitemap — Auto-generated from NeonDB products + videos + SEO pages
 * Google crawls this to discover all product, video and landing pages
 */

import { dbQuery } from "@/lib/db";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // Regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://swypik.com";

  // ── Static pages ──────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/unsubscribe`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.1 },
  ];

  // ── SEO landing pages ─────────────────────────────────────────
  const seoSlugs = [
    "rochii-vara", "outfit-complet", "cadouri-sub-200",
    "tinute-office", "casual-streetwear", "fitness-yoga", "vintage-retro",
  ];
  const seoPages: MetadataRoute.Sitemap = seoSlugs.map((slug) => ({
    url: `${baseUrl}/best/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // ── Product pages — active marketplace products (top 1000) ────
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const { rows } = await dbQuery(
      `SELECT id, slug, updated_at FROM marketplace_products
       WHERE status = 'active'
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1000`
    );
    productPages = rows.map((row: any) => ({
      url: `${baseUrl}/product/${row.slug || row.id}`,
      lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (e) {
    console.error("[Sitemap] Failed to fetch marketplace products:", e);
  }

  // ── Legacy AE product pages — top 2000 by orders ──────────────
  let aeProductPages: MetadataRoute.Sitemap = [];
  try {
    const { rows } = await dbQuery(
      `SELECT id, updated_at FROM ae_products
       WHERE main_image IS NOT NULL AND min_price_usd > 0.1
       ORDER BY orders_count DESC NULLS LAST
       LIMIT 2000`
    );
    aeProductPages = rows.map((row: any) => ({
      url: `${baseUrl}/product/${row.id}`,
      lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (e) {
    console.error("[Sitemap] Failed to fetch AE products:", e);
  }

  // ── Video pages — public, ready videos (top 500) ──────────────
  let videoPages: MetadataRoute.Sitemap = [];
  try {
    const { rows } = await dbQuery(
      `SELECT id, published_at FROM videos
       WHERE status = 'ready' AND visibility = 'public'
       ORDER BY published_at DESC NULLS LAST
       LIMIT 500`
    );
    videoPages = rows.map((row: any) => ({
      url: `${baseUrl}/video/${row.id}`,
      lastModified: row.published_at ? new Date(row.published_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch (e) {
    console.error("[Sitemap] Failed to fetch videos:", e);
  }

  return [
    ...staticPages,
    ...seoPages,
    ...productPages,
    ...aeProductPages,
    ...videoPages,
  ];
}
