/**
 * Product sitemaps — split in 10k chunks via generateSitemaps.
 * Output URLs: /products/sitemap/0.xml ... /products/sitemap/N.xml
 * Includes per-product hreflang alternates from product_translations.
 */

import { dbQuery } from "@/lib/db";
import { LOCALES } from "@/lib/i18n/config";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const CHUNK_SIZE = 10000;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://swypik.com";

async function countSafeProducts(): Promise<number> {
  try {
    const { rows } = await dbQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM marketplace_products p
       WHERE p.status='active' AND p.effective_label='safe'`,
    );
    return Number(rows[0]?.n || 0);
  } catch (e) {
    console.error("[ProductsSitemap] count failed:", e);
    return 0;
  }
}

export async function generateSitemaps(): Promise<{ id: number }[]> {
  const total = await countSafeProducts();
  const chunks = Math.max(1, Math.ceil(total / CHUNK_SIZE));
  return Array.from({ length: chunks }, (_, i) => ({ id: i }));
}

function buildLanguages(productId: string, perLocale: Map<string, string | null>): Record<string, string> {
  const out: Record<string, string> = { "x-default": `${BASE_URL}/product/${productId}` };
  for (const l of LOCALES) {
    if (perLocale.has(l)) {
      const slug = perLocale.get(l);
      out[l] = slug ? `${BASE_URL}/product/${slug}` : `${BASE_URL}/product/${productId}?locale=${l}`;
    }
  }
  return out;
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const offset = id * CHUNK_SIZE;

  let rows: Array<{ id: string; updated_at: Date | null; image_url: string | null }> = [];
  try {
    const res = await dbQuery<{ id: string; updated_at: Date | null; image_url: string | null }>(
      `SELECT p.id, p.updated_at, p.image_url
         FROM marketplace_products p
        WHERE p.status='active' AND p.effective_label='safe'
        ORDER BY p.id
        LIMIT $1 OFFSET $2`,
      [CHUNK_SIZE, offset],
    );
    rows = res.rows;
  } catch (e) {
    console.error("[ProductsSitemap] fetch chunk failed:", e);
    return [];
  }

  const ids = rows.map((r) => r.id);
  const trIdx = new Map<string, Map<string, string | null>>();
  if (ids.length > 0) {
    try {
      const { rows: trRows } = await dbQuery<{ product_id: string; locale: string; slug: string | null }>(
        `SELECT product_id, locale, NULLIF(slug, '') AS slug
           FROM product_translations
          WHERE locale = ANY($1::text[]) AND product_id = ANY($2::uuid[])`,
        [[...LOCALES], ids],
      );
      for (const t of trRows) {
        let m = trIdx.get(t.product_id);
        if (!m) { m = new Map(); trIdx.set(t.product_id, m); }
        m.set(t.locale, t.slug);
      }
    } catch (e) {
      console.error("[ProductsSitemap] translations fetch failed:", e);
    }
  }

  return rows.map((row) => {
    const langs = trIdx.get(row.id);
    const preferredSlug = langs?.get("ro") || langs?.get("en") || null;
    const entry: MetadataRoute.Sitemap[number] = {
      url: preferredSlug ? `${BASE_URL}/product/${preferredSlug}` : `${BASE_URL}/product/${row.id}`,
      lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    };
    if (row.image_url) (entry as any).images = [row.image_url];
    if (langs && langs.size > 0) {
      entry.alternates = { languages: buildLanguages(row.id, langs) };
    }
    return entry;
  });
}
