/**
 * Product Page — Server Component with SSR data
 * 
 * - generateMetadata: SEO title, description, OG tags
 * - JSON-LD: Product structured data (only real ratings)
 * - Passes initialData to ProductClient to avoid double fetch
 */

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getProductDetail as _getProductDetail } from "@/lib/products/get-product-detail";
const getProductDetail = cache(_getProductDetail);
import ProductClient from "./ProductClient";
import ReviewList from "@/components/reviews/ReviewList";
import ReviewForm from "@/components/reviews/ReviewForm";
import StarRating from "@/components/reviews/StarRating";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { safeJsonLd } from "@/lib/seo/json-ld";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getProductDetail(id);
  if (!data) return { title: "Produs negăsit — Swypik" };

  const { product } = data;
  const title = `${product.title} — ${product.price} lei — Swypik`;
  const description = product.description
    ? `${product.description.replace(/<[^>]*>/g, " ").trim().slice(0, 150)}... Cumpără acum de pe Swypik cu livrare în România.`
    : `${product.title} — livrare rapidă în România. Cumpără de pe Swypik.`;

  return {
    title,
    description,
    openGraph: {
      title: product.title,
      description,
      images: product.images?.[0] ? [{ url: product.images[0], width: 800, height: 800 }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      images: product.images?.[0] ? [product.images[0]] : [],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const data = await getProductDetail(id);
  if (!data) notFound();
  const session = await getAuthSession();

  // SSR-prefetch clips for this product (so "Clips (N)" is correct on first paint)
  let initialVideos: Array<{ id: string; title: string; playbackUrl: string; thumbnailUrl: string; durationSeconds: number; viewCount: number; likeCount: number; publishedAt: string; creatorName: string; creatorId: string; description: string }> = [];
  if (data) {
    try {
      const { rows: vRows } = await dbQuery<any>(
        `SELECT v.id, v.title, v.description, v.playback_url, v.thumbnail_url, v.duration_ms,
                v.view_count, v.like_count, v.published_at,
                u.display_name AS creator_name, u.id AS creator_id
           FROM videos v
           JOIN users u ON v.creator_id = u.id
          WHERE v.status='ready' AND v.visibility='public'
            AND COALESCE(v.is_hidden,false)=false
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(v.product_refs,'[]'::jsonb)) e
              WHERE (e ? 'product_id' AND e->>'product_id' = $1)
                 OR (jsonb_typeof(e)='string' AND e #>> '{}' = $1)
            )
          ORDER BY v.view_count DESC NULLS LAST, v.published_at DESC NULLS LAST
          LIMIT 12`,
        [id]
      );
      initialVideos = vRows.map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description ?? "",
        playbackUrl: r.playback_url,
        thumbnailUrl: r.thumbnail_url,
        durationSeconds: r.duration_ms ? Math.round(r.duration_ms / 1000) : 0,
        viewCount: Number(r.view_count) || 0,
        likeCount: Number(r.like_count) || 0,
        publishedAt: r.published_at,
        creatorName: r.creator_name,
        creatorId: r.creator_id,
      }));
    } catch { /* non-fatal */ }
  }

  // SSR-prefetch similar products (taxonomy match) for SEO internal linking
  let initialSimilar: Array<{ id: string; title: string; price: number; image: string; oldPrice: number; hasVideo: boolean; rating: number; ratingAvg: number | null; ratingCount: number }> = [];
  if (data) {
    try {
      const { rows: sRows } = await dbQuery<any>(
        `SELECT p.id, p.title, p.price_cents, p.image_url
           FROM marketplace_products p
          WHERE p.status = 'active'
            AND p.id <> $1
            AND p.image_url IS NOT NULL
            AND p.price_cents IS NOT NULL
            AND p.taxonomy_node_slug = (SELECT taxonomy_node_slug FROM marketplace_products WHERE id = $1)
            AND COALESCE(p.is_adult, false) = false
          ORDER BY p.view_count DESC NULLS LAST, p.created_at DESC NULLS LAST
          LIMIT 8`,
        [id]
      );
      initialSimilar = sRows.map((r: any) => ({
        id: r.id,
        title: r.title,
        price: r.price_cents ? r.price_cents / 100 : 0,
        oldPrice: 0,
        image: r.image_url || "",
        hasVideo: false,
        rating: 0,
        ratingAvg: null,
        ratingCount: 0,
      }));
    } catch { /* non-fatal */ }
  }

  // Reviews aggregate + capability checks
  let reviewsAgg: { average: number | null; total: number } = { average: null, total: 0 };
  let canReview = false;
  let alreadyReviewed = false;
  if (data) {
    const { rows: aggRows } = await dbQuery<{ avg_rating: string | null; total: string }>(
      "SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::text AS total FROM product_reviews WHERE product_id = $1 AND is_hidden = false",
      [id]
    );
    const a = aggRows[0];
    reviewsAgg = {
      average: a?.avg_rating ? Number(a.avg_rating) : null,
      total: Number(a?.total || "0"),
    };
    if (session) {
      const { rows: ownRows } = await dbQuery<{ id: string }>(
        "SELECT id FROM product_reviews WHERE product_id = $1 AND user_id = $2 LIMIT 1",
        [id, session.userId]
      );
      alreadyReviewed = ownRows.length > 0;
      if (!alreadyReviewed) {
        const { rows: orderRows } = await dbQuery<{ order_id: string }>(
          "SELECT oi.order_id FROM commerce_order_items oi JOIN commerce_orders o ON o.id = oi.order_id WHERE oi.product_id = $1 AND o.buyer_user_id = $2 AND o.status IN ('paid','fulfilled') LIMIT 1",
          [id, session.userId]
        );
        canReview = orderRows.length > 0;
      }
    }
  }

  // JSON-LD — only include aggregateRating when data is REAL
  let jsonLd = null;
  if (data) {
    const { product } = data;
    jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      description: (product.description || product.title).replace(/<[^>]*>/g, " ").trim().slice(0, 300),
      image: product.images?.[0],
      offers: {
        "@type": "Offer",
        price: product.price,
        priceCurrency: "RON",
        availability: "https://schema.org/InStock",
        seller: {
          "@type": "Organization",
          name: "Swypik",
        },
      },
      // Only include rating when NOT estimated
      ...(product.rating && !product.isEstimatedSocial && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: product.rating,
          bestRating: 5,
          worstRating: 1,
          ratingCount: product.ordersCount || 1,
        },
      }),
    };
  }

  // Breadcrumb JSON-LD: Home > Explore > {product title}
  const breadcrumbJsonLd = data ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://swypik.com/" },
      { "@type": "ListItem", position: 2, name: "Explore", item: "https://swypik.com/explore" },
      { "@type": "ListItem", position: 3, name: data.product.title?.slice(0, 80) || "Product", item: `https://swypik.com/product/${data.product.id}` },
    ],
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      )}
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
        />
      )}
      <ProductClient initialData={{ ...data, similar: initialSimilar.length > 0 ? initialSimilar : (data?.similar || []) }} initialVideos={initialVideos} />
    </>
  );
}
