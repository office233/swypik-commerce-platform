import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/db/product-queries";
import { proxyToSocialApi } from "@/lib/social/proxy";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

function toInt(value: string | null, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.trunc(n), max));
}

function toFeedItem(product: any, index: number, seed: number) {
  const likes = product.likes || Math.max(3, Math.round((product.orders || 30) * 0.35));
  const comments = product.commentCount || Math.max(1, Math.round((product.orders || 30) * 0.04));
  const productId = String(product.pgId || product.product_id || product.productId || product.id);
  const numericProductId = Number(product.pgId || product.id);
  const videoId = product.video_id || product.videoId || (product.video ? `product_${product.id}` : `feed_${product.id}`);
  const creatorId = product.creator_id || product.creatorId || "swypik";
  const score =
    (product.orders || 0) * 0.45 +
    (product.rating || 0) * 80 +
    (product.discountPercent || 0) * 6 +
    ((seed + index * 97) % 100);

  return {
    id: `feed_${product.id}`,
    product_id: productId,
    productId: Number.isFinite(numericProductId) && numericProductId > 0 ? numericProductId : productId,
    video_id: videoId,
    videoId,
    creator_id: creatorId,
    creatorId,
    creator: {
      id: creatorId,
      username: "Swypik",
      displayName: "Swypik",
      avatarUrl: null,
    },
    video: {
      hlsUrl: product.video || null,
      mp4Url: product.video || null,
      posterUrl: product.images?.[0] || null,
      status: product.video ? "ready" : "poster_only",
    },
    product: {
      ...product,
      product_id: productId,
      productId: Number.isFinite(numericProductId) && numericProductId > 0 ? numericProductId : productId,
      video_id: videoId,
      videoId,
      creator_id: creatorId,
      creatorId,
    },
    stats: {
      likes,
      comments,
      saves: Math.max(1, Math.round(likes * 0.18)),
      shares: Math.max(1, Math.round(likes * 0.07)),
      orders: product.orders || 0,
    },
    ranking: {
      score,
      reason: product.video ? "video_commerce_seeded" : "commerce_seeded",
    },
  };
}

export async function GET(req: Request) {
  try {
    const proxied = await proxyToSocialApi(req, "/v1/feed");
    if (proxied) return proxied;

    const url = new URL(req.url);
    const limit = toInt(url.searchParams.get("limit"), 15, 1, 50);
    const offset = toInt(url.searchParams.get("offset"), 0, 0, 100000);
    const seed = toInt(url.searchParams.get("seed"), 0, 0, 1000000);

    const result = await searchProducts({
      mode: "video",
      sort: "popular",
      limit,
      offset,
      seed,
    });

    const items = result.products.map((product: any, index: number) =>
      toFeedItem(product, offset + index, seed)
    );

    const userId = await getOptionalSocialUserId().catch(() => null);
    let visibleItems = items;
    if (userId) {
      try {
        const { rows } = await dbQuery<{ seen_video_ids: string[] }>(
          "SELECT seen_video_ids FROM user_feed_state WHERE user_id = $1::uuid AND feed_type = 'for_you' LIMIT 1",
          [userId],
        );
        const seen = new Set<string>(Array.isArray(rows?.[0]?.seen_video_ids) ? rows[0].seen_video_ids as string[] : []);
        if (seen.size > 0) {
          visibleItems = items.filter((it: any) => !seen.has(String(it.video_id)));
          if (visibleItems.length === 0) visibleItems = items;
        }
        const newIds = visibleItems.map((it: any) => String(it.video_id)).filter(Boolean);
        if (newIds.length > 0) {
          const merged = Array.from(new Set([...newIds.reverse(), ...Array.from(seen)])).slice(0, 500);
          await dbQuery(
            `INSERT INTO user_feed_state (user_id, feed_type, seen_video_ids, last_refreshed_at, updated_at)
             VALUES ($1::uuid, 'for_you', $2::jsonb, NOW(), NOW())
             ON CONFLICT (user_id, feed_type)
             DO UPDATE SET seen_video_ids = EXCLUDED.seen_video_ids, last_refreshed_at = NOW(), updated_at = NOW()`,
            [userId, JSON.stringify(merged)],
          );
        }
      } catch (e) {
        console.warn("[v1/feed] seen-tracking failed", e);
      }
    }

    const nextOffset = offset + result.products.length;

    return NextResponse.json(
      {
        items: visibleItems,
        products: result.products,
        paging: {
          offset,
          limit,
          nextOffset: nextOffset < result.total ? nextOffset : null,
          total: result.total,
        },
        source: "next-fallback",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=240",
          "CDN-Cache-Control": "public, max-age=120",
        },
      }
    );
  } catch (error) {
    console.error("[Social Feed Fallback]", error);
    return NextResponse.json({ items: [], products: [], error: "Feed unavailable" }, { status: 500 });
  }
}
