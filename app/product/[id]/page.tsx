/**
 * Product Page — Server Component with SSR data
 * 
 * - generateMetadata: SEO title, description, OG tags
 * - JSON-LD: Product structured data (only real ratings)
 * - Passes initialData to ProductClient to avoid double fetch
 */

import { Metadata } from "next";
import { getProductDetail } from "@/lib/products/get-product-detail";
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
  const session = await getAuthSession();

  // Reviews aggregate + capability checks
  let reviewsAgg: { average: number | null; total: number } = { average: null, total: 0 };
  let canReview = false;
  let alreadyReviewed = false;
  if (data) {
    const productId = data.product.id;
    const { rows: aggRows } = await dbQuery<{ avg_rating: string | null; total: string }>(
      "SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::text AS total FROM product_reviews WHERE product_id = $1 AND is_hidden = false",
      [productId]
    );
    const a = aggRows[0];
    reviewsAgg = {
      average: a?.avg_rating ? Number(a.avg_rating) : null,
      total: Number(a?.total || "0"),
    };
    if (session) {
      const { rows: ownRows } = await dbQuery<{ id: string }>(
        "SELECT id FROM product_reviews WHERE product_id = $1 AND user_id = $2 LIMIT 1",
        [productId, session.userId]
      );
      alreadyReviewed = ownRows.length > 0;
      if (!alreadyReviewed) {
        const { rows: orderRows } = await dbQuery<{ order_id: string }>(
          "SELECT oi.order_id FROM commerce_order_items oi JOIN commerce_orders o ON o.id = oi.order_id WHERE oi.product_id = $1 AND o.buyer_user_id = $2 AND o.status IN ('paid','fulfilled') LIMIT 1",
          [productId, session.userId]
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

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json">{safeJsonLd(jsonLd)}</script>
      )}
      <ProductClient initialData={data} />
      {data && (
        <section className="max-w-3xl mx-auto px-4 py-6" aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className="text-lg font-semibold mb-2">Recenzii</h2>
          <div className="flex items-center gap-2 mb-4">
            <StarRating value={reviewsAgg.average ?? 0} size={18} />
            <span className="text-sm text-gray-600">
              {reviewsAgg.average != null
                ? `${reviewsAgg.average.toFixed(1)} / 5 (${reviewsAgg.total} recenzii)`
                : "Niciun review încă"}
            </span>
          </div>
          <ReviewList productId={data.product.id} limit={10} />
          {session && canReview && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2">Lasă o recenzie</h3>
              <ReviewForm productId={data.product.id} />
            </div>
          )}
          {session && alreadyReviewed && (
            <p className="mt-4 text-sm text-gray-500">Ai lăsat deja o recenzie pentru acest produs.</p>
          )}
          {session && !canReview && !alreadyReviewed && (
            <p className="mt-4 text-sm text-gray-500">Doar cumpărătorii verificați pot lăsa recenzii.</p>
          )}
        </section>
      )}
    </>
  );
}
