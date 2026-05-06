import { NextResponse } from "next/server";
import { getShopifyAccessToken } from "@/lib/shopify/auth";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

type ShopifyProduct = {
  id: number | string;
  title: string;
  status?: string;
  body_html?: string;
  product_type?: string;
  vendor?: string;
  tags?: string;
  images?: { src: string }[];
  variants?: {
    id?: number | string;
    price?: string;
    sku?: string;
    inventory_quantity?: number;
  }[];
};

async function shopifyGET(endpoint: string) {
  const token = await getShopifyAccessToken();
  const store = process.env.SHOPIFY_STORE;

  if (!store) throw new Error("SHOPIFY_STORE is missing");

  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Shopify ${res.status}: ${text.slice(0, 300)}`);
  }

  return text ? JSON.parse(text) : {};
}

export async function GET() {
  try {
    const data = await shopifyGET(
      "products.json?limit=250&status=active&fields=id,title,status,body_html,product_type,vendor,tags,images,variants"
    );

    const products: ShopifyProduct[] = data.products || [];

    const withImages = products.filter((p) => (p.images?.length || 0) > 0).length;
    const withProductType = products.filter((p) => Boolean(p.product_type)).length;
    const withTags = products.filter((p) => Boolean(p.tags)).length;
    const withVariants = products.filter((p) => (p.variants?.length || 0) > 0).length;
    const withPrice = products.filter((p) => Number(p.variants?.[0]?.price || 0) > 0).length;

    const productTypes = Array.from(
      new Set(products.map((p) => p.product_type).filter(Boolean))
    ).slice(0, 50);

    const vendors = Array.from(
      new Set(products.map((p) => p.vendor).filter(Boolean))
    ).slice(0, 50);

    const topTags = Array.from(
      new Set(
        products
          .flatMap((p) => (p.tags || "").split(","))
          .map((t) => t.trim())
          .filter(Boolean)
      )
    ).slice(0, 100);

    const sampleProducts = products.slice(0, 20).map((p) => ({
      id: String(p.id),
      title: p.title,
      productType: p.product_type || null,
      vendor: p.vendor || null,
      tags: (p.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10),
      images: p.images?.length || 0,
      variants: p.variants?.length || 0,
      price: p.variants?.[0]?.price || null,
      variantId: p.variants?.[0]?.id ? String(p.variants[0].id) : null,
      sku: p.variants?.[0]?.sku || null,
      hasDescription: Boolean(p.body_html && p.body_html.length > 20),
    }));

    return NextResponse.json({
      ok: true,
      apiVersion: API_VERSION,
      totals: {
        activeProducts: products.length,
        withImages,
        withProductType,
        withTags,
        withVariants,
        withPrice,
      },
      productTypes,
      vendors,
      topTags,
      sampleProducts,
    });
  } catch (error: any) {
    console.error("[Shopify Debug Products]", error.message);

    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
