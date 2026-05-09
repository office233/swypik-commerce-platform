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

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getProductDetail(id);
  if (!data) return { title: "Produs negăsit — AICeVrei.ro" };

  const { product } = data;
  const title = `${product.title} — ${product.price} lei — AICeVrei.ro`;
  const description = product.description
    ? `${product.description.replace(/<[^>]*>/g, " ").trim().slice(0, 150)}... Cumpără acum de pe AICeVrei.ro cu livrare în România.`
    : `${product.title} — livrare rapidă în România. Cumpără de pe AICeVrei.ro.`;

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
          name: "AICeVrei.ro",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductClient initialData={data} />
    </>
  );
}
