/**
 * Product Page — Server Component wrapper for SEO
 * 
 * Fetches product from DB server-side for:
 * - generateMetadata (title, description, OpenGraph)
 * - JSON-LD structured data (Product schema)
 * 
 * Renders ProductClient for interactive UI (client component).
 */

import { Metadata } from "next";
import { getProductById } from "@/lib/db/product-queries";
import ProductClient from "./ProductClient";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const numId = Number(id);
  if (isNaN(numId)) return { title: "Produs — AICeVrei.ro" };

  const product = await getProductById(numId);
  if (!product) return { title: "Produs negăsit — AICeVrei.ro" };

  const title = `${product.title} — ${product.price} lei — AICeVrei.ro`;
  const description = product.description
    ? `${product.description.slice(0, 150)}... Cumpără acum de pe AICeVrei.ro cu livrare în România.`
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
  const numId = Number(id);

  // Pre-fetch product for JSON-LD (client component handles its own data loading)
  let jsonLd = null;
  if (!isNaN(numId)) {
    const product = await getProductById(numId);
    if (product) {
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        description: product.description || product.title,
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
        ...(product.rating && {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            bestRating: 5,
            worstRating: 1,
            ...(product.isEstimatedSocial
              ? {}
              : { ratingCount: product.orders || 1 }),
          },
        }),
      };
    }
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductClient />
    </>
  );
}
