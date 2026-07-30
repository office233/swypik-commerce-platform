import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/db/product-queries";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { logger } from "@/lib/logger";
import type { OfferPost, OffersFeedResponse, OffersSort } from "@/lib/types/feed";

export const dynamic = "force-dynamic";

const SORT_MAP: Record<OffersSort, { sort?: "popular" | "newest" | "discount"; mode?: "trending" | "deals" }> = {
  popular: { sort: "popular", mode: "trending" },
  new: { sort: "newest" },
  discount: { sort: "discount", mode: "deals" },
};

function num(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/feed/offers — feed-ul social de pe home (doar poze + oferte).
 * Params: limit, offset, sort=popular|new|discount, minPrice, maxPrice,
 *         minDiscount (%), minRating, category, locale.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sp = url.searchParams;

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 12, 1), 40);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);
    const sortKey = (sp.get("sort") ?? "popular") as OffersSort;
    const { sort, mode } = SORT_MAP[sortKey] ?? SORT_MAP.popular;
    const minDiscount = num(sp.get("minDiscount")) ?? 0;
    const minRating = num(sp.get("minRating")) ?? 0;
    const locale = sp.get("locale") ?? "ro";
    const category = sp.get("category") ?? undefined;

    // Cerem mai mult decât limit ca să compensăm filtrarea post-query
    // (imagine validă, minDiscount, minRating se aplică după transform).
    const fetchLimit = Math.min(limit * 3, 120);

    const result = await searchProducts({
      limit: fetchLimit,
      offset,
      sort,
      mode,
      locale,
      category,
      minPrice: num(sp.get("minPrice")),
      maxPrice: num(sp.get("maxPrice")),
    });

    const filtered = result.products.filter((p: any) => {
      const img = Array.isArray(p.images) ? p.images[0] : undefined;
      if (!img || typeof img !== "string" || !/^https?:\/\//.test(img)) return false;
      if (!p.hasValidPrice) return false;
      if (minDiscount > 0 && (p.discountPercent ?? 0) < minDiscount) return false;
      if (minRating > 0 && (p.rating ?? 0) < minRating) return false;
      return true;
    });

    const page = filtered.slice(0, limit);
    const ids = page.map((p: any) => String(p.id));

    // Stats + like-ul viewer-ului
    let statsMap = new Map<string, { like: number; share: number }>();
    let likedSet = new Set<string>();
    if (ids.length) {
      const { rows: statRows } = await dbQuery(
        `SELECT product_id, like_count, share_count FROM product_stats WHERE product_id = ANY($1::uuid[])`,
        [ids]
      );
      statsMap = new Map(
        statRows.map((r: any) => [String(r.product_id), { like: Number(r.like_count) || 0, share: Number(r.share_count) || 0 }])
      );
      const viewerId = await getOptionalSocialUserId();
      if (viewerId) {
        const { rows: likeRows } = await dbQuery(
          `SELECT product_id FROM likes WHERE user_id = $1 AND product_id = ANY($2::uuid[])`,
          [viewerId, ids]
        );
        likedSet = new Set(likeRows.map((r: any) => String(r.product_id)));
      }
    }

    const items: OfferPost[] = page.map((p: any) => {
      const st = statsMap.get(String(p.id));
      return {
        id: String(p.id),
        title: p.title,
        image: p.images[0],
        price: p.price,
        oldPrice: p.oldPrice,
        discountPercent: p.discountPercent ?? 0,
        currency: "RON",
        rating: p.rating ?? 0,
        orders: p.orders ?? 0,
        brand: p.vendor || p.category || "Swypik",
        category: p.category || "General",
        categoryId: p.categoryId,
        shipFree: Boolean(p.shipFree),
        likeCount: st?.like ?? 0,
        shareCount: st?.share ?? 0,
        viewerLiked: likedSet.has(String(p.id)),
      };
    });

    const body: OffersFeedResponse = {
      items,
      nextOffset: offset + fetchLimit,
      hasMore: result.hasMore || filtered.length > limit,
    };
    return NextResponse.json(body);
  } catch (error) {
    logger.error({ error: String(error) }, "offers feed failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
