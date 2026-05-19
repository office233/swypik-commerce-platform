/**
 * Swypik Arena feed — community posts in all 8 formats.
 *
 * Read-only for now. Authoring (POST /api/posts) lands once the upload/
 * moderation flow for non-video posts is wired through ContentModeration.
 *
 * Query params:
 *   format=merita|battle|find_me|setup|drop|review_real|dupe_hunt|roast_cart
 *   sort=hot|new|ending     (default: hot)
 *   limit=1..50             (default: 20)
 *   cursor=<iso ts>         (optional)
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

const FORMATS = new Set([
  "merita",
  "battle",
  "find_me",
  "setup",
  "drop",
  "review_real",
  "dupe_hunt",
  "roast_cart",
]);

type PostRow = {
  id: string;
  slug: string | null;
  format: string;
  title: string;
  body: string | null;
  budget_minor: number | null;
  budget_currency: string | null;
  vote_count: number;
  comment_count: number;
  save_count: number;
  view_count: number;
  hot_score: string;
  ends_at: string | null;
  created_at: string;
  author_id: string;
  author_handle: string | null;
  author_display: string | null;
  author_avatar: string | null;
};

type ItemRow = {
  post_id: string;
  option_key: string;
  label: string | null;
  vote_count: number;
  position: number;
  product_id: string | null;
  product_title: string | null;
  product_image: string | null;
  product_price_minor: number | null;
  product_currency: string | null;
  external_url: string | null;
  external_image: string | null;
  external_title: string | null;
  external_price_minor: number | null;
  external_currency: string | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const sort = url.searchParams.get("sort") || "hot";
  const limitRaw = Number(url.searchParams.get("limit") || 20);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(Math.trunc(limitRaw), 50))
    : 20;
  const cursor = url.searchParams.get("cursor");

  if (format && !FORMATS.has(format)) {
    return NextResponse.json({ error: "invalid_format" }, { status: 400 });
  }

  const orderBy =
    sort === "new"
      ? "p.created_at DESC"
      : sort === "ending"
        ? "(p.ends_at IS NULL), p.ends_at ASC"
        : "p.hot_score DESC, p.created_at DESC";

  const where: string[] = ["p.status = 'active'", "p.is_adult = FALSE"];
  const params: unknown[] = [];
  if (format) {
    params.push(format);
    where.push(`p.format = $${params.length}`);
  }
  if (cursor) {
    params.push(cursor);
    where.push(`p.created_at < $${params.length}`);
  }
  params.push(limit);

  try {
    const { rows: posts } = await dbQuery<PostRow>(
      `SELECT
         p.id, p.slug, p.format, p.title, p.body,
         p.budget_minor, p.budget_currency,
         p.vote_count, p.comment_count, p.save_count, p.view_count,
         p.hot_score::text AS hot_score,
         p.ends_at, p.created_at,
         p.author_user_id AS author_id,
         u.username AS author_handle,
         u.display_name AS author_display,
         u.avatar_url AS author_avatar
       FROM community_posts p
       LEFT JOIN users u ON u.id = p.author_user_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT $${params.length}`,
      params,
    );

    if (posts.length === 0) {
      return NextResponse.json(
        { posts: [], nextCursor: null },
        { headers: { "Cache-Control": "public, max-age=15, s-maxage=60" } },
      );
    }

    const ids = posts.map((p) => p.id);
    const { rows: items } = await dbQuery<ItemRow>(
      `SELECT
         i.post_id, i.option_key, i.label, i.vote_count, i.position,
         i.product_id,
         mp.title AS product_title,
         (mp.images->>0) AS product_image,
         mp.price_minor AS product_price_minor,
         mp.currency AS product_currency,
         i.external_url, i.external_image, i.external_title,
         i.external_price_minor, i.external_currency
       FROM community_post_items i
       LEFT JOIN marketplace_products mp ON mp.id = i.product_id
       WHERE i.post_id = ANY($1::uuid[])
       ORDER BY i.post_id, i.position`,
      [ids],
    );

    const itemsByPost = new Map<string, ItemRow[]>();
    for (const it of items) {
      const arr = itemsByPost.get(it.post_id) ?? [];
      arr.push(it);
      itemsByPost.set(it.post_id, arr);
    }

    const out = posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      format: p.format,
      title: p.title,
      body: p.body,
      budget: p.budget_minor
        ? { amountMinor: p.budget_minor, currency: p.budget_currency || "RON" }
        : null,
      counts: {
        votes: p.vote_count,
        comments: p.comment_count,
        saves: p.save_count,
        views: p.view_count,
      },
      hotScore: Number(p.hot_score),
      endsAt: p.ends_at,
      createdAt: p.created_at,
      author: {
        id: p.author_id,
        handle: p.author_handle,
        displayName: p.author_display,
        avatar: p.author_avatar,
      },
      items: (itemsByPost.get(p.id) ?? []).map((i) => ({
        optionKey: i.option_key,
        label: i.label,
        votes: i.vote_count,
        product: i.product_id
          ? {
              id: i.product_id,
              title: i.product_title,
              image: i.product_image,
              priceMinor: i.product_price_minor,
              currency: i.product_currency,
            }
          : null,
        external: i.external_url
          ? {
              url: i.external_url,
              image: i.external_image,
              title: i.external_title,
              priceMinor: i.external_price_minor,
              currency: i.external_currency,
            }
          : null,
      })),
    }));

    const last = posts[posts.length - 1];
    return NextResponse.json(
      {
        posts: out,
        nextCursor: posts.length === limit ? last.created_at : null,
      },
      {
        headers: {
          "Cache-Control":
            "public, max-age=15, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    // Tables may not exist yet on first deploy — fail soft so the UI can render.
    return NextResponse.json(
      { posts: [], nextCursor: null, error: (err as Error).message },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
