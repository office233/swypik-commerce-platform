/**
 * GET /api/pi/products          -> catalog page (Pi-safe fields only)
 * GET /api/pi/products?id=<id>  -> single product detail
 *
 * Returns ONLY the fields the Pi shell needs, with prices already converted
 * to Pi at the live market rate. Deliberately omits every fiat field
 * (RON price, Stripe data, oldPrice/discount) so the Pi-only experience
 * never exposes a non-Pi payment surface (Mainnet requirement #5).
 */

import { NextResponse } from "next/server";
import { getPiToRonRate } from "@/lib/pi/rate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RawProduct = {
  id: string;
  title?: string;
  titleEn?: string;
  description?: string;
  price?: number; // RON
  images?: string[];
  rating?: number;
  orders?: number;
  category?: string;
  deliveryDays?: number;
};

function toPi(ron: number, rate: number): number | null {
  if (!rate || rate <= 0 || !ron || ron <= 0) return null;
  return Math.round((ron / rate) * 1e7) / 1e7;
}

async function fetchCatalog(params: string): Promise<RawProduct[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com";
  const res = await fetch(`${base}/api/products?${params}`, {
    next: { revalidate: 120 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.products || data.items || []) as RawProduct[];
}

function shape(p: RawProduct, rate: number) {
  // Prefer English title for the Pi audience; fall back to default.
  const title = p.titleEn || p.title || "";
  return {
    id: p.id,
    title,
    description: p.description || "",
    images: Array.isArray(p.images) ? p.images.slice(0, 6) : [],
    amountPi: p.price != null ? toPi(p.price, rate) : null,
    rating: p.rating ?? null,
    orders: p.orders ?? null,
    category: p.category ?? null,
    deliveryDays: p.deliveryDays ?? null,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  let rate = 0;
  try {
    rate = await getPiToRonRate();
  } catch {
    rate = 0;
  }

  if (id) {
    const products = await fetchCatalog(`limit=1&ids=${encodeURIComponent(id)}`);
    // Fallback: some catalogs don't support ids filter — fetch a page + find.
    let found: RawProduct | undefined = products.find((p) => p.id === id) || products[0];
    if (!found) {
      const page = await fetchCatalog("limit=50");
      found = page.find((p) => p.id === id);
    }
    if (!found) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ product: shape(found, rate), rate });
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 60);
  const search = url.searchParams.get("q");
  const qs = search
    ? `limit=${limit}&search=${encodeURIComponent(search)}`
    : `limit=${limit}`;
  const products = await fetchCatalog(qs);
  return NextResponse.json({
    products: products.map((p) => shape(p, rate)),
    rate,
  });
}
