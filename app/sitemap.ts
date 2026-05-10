/**
 * Dynamic Sitemap — Auto-generated from NeonDB products + SEO pages
 * Google crawls this to discover all product pages
 */

import { dbQuery } from "@/lib/db";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // Regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://aicevrei.ro";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
  ];

  // SEO landing pages
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

  // Product pages — top 2000 by orders
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const { rows } = await dbQuery(
      `SELECT id, updated_at FROM ae_products
       WHERE main_image IS NOT NULL AND min_price_usd > 0.1
       ORDER BY orders_count DESC NULLS LAST
       LIMIT 2000`
    );
    productPages = rows.map((row: any) => ({
      url: `${baseUrl}/product/${row.id}`,
      lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (e) {
    console.error("[Sitemap] Failed to fetch products:", e);
  }

  return [...staticPages, ...seoPages, ...productPages];
}
