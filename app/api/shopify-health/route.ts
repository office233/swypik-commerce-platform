import { NextResponse } from "next/server";
import { getShopifyAccessToken } from "@/lib/shopify/auth";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

type ShopifyProduct = {
  id: number | string;
  title: string;
  status?: string;
  product_type?: string;
  vendor?: string;
  images?: { src: string }[];
  variants?: { id?: number | string; price?: string; sku?: string }[];
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
    const store = process.env.SHOPIFY_STORE || null;
    const data = await shopifyGET("products.json?limit=10&status=active&fields=id,title,status,product_type,vendor,images,variants");
    const products: ShopifyProduct[] = data.products || [];

    const sampleProducts = products.map((p) => {
      const variant = p.variants?.[0];

      return {
        id: String(p.id),
        title: p.title,
        status: p.status,
        productType: p.product_type || null,
        vendor: p.vendor || null,
        price: variant?.price || null,
        variantId: variant?.id ? String(variant.id) : null,
        sku: variant?.sku || null,
        images: p.images?.length || 0,
      };
    });

    return NextResponse.json({
      ok: true,
      store,
      apiVersion: API_VERSION,
      productsRead: true,
      activeProductsInSample: products.length,
      sampleProducts,
    });
  } catch (error: any) {
    console.error("[Shopify Health]", error.message);

    return NextResponse.json(
      {
        ok: false,
        apiVersion: API_VERSION,
        productsRead: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
