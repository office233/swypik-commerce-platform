/**
 * Adult feed — paginated list of active posts.
 *
 * Viewer MUST be age-verified (getAdultAccess). Returns preview_url
 * (signed) if a preview key exists; premium URL is NEVER exposed here.
 *
 * Pagination via ?cursor=<published_at_iso>&limit=24.
 */

import { NextResponse } from "next/server";
import { getAdultAccess } from "@/lib/adult/gate";
import { adultQuery } from "@/lib/adult/db";
import { signAdultGet } from "@/lib/adult/storageSign";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  creator_user_id: string;
  kind: string;
  title: string;
  preview_media_key: string | null;
  price_minor: number;
  currency: string;
  requires_subscription: boolean;
  duration_seconds: number | null;
  unlock_count: number;
  tip_total_minor: number;
  published_at: string;
}

export async function GET(req: Request) {
  const access = await getAdultAccess();
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === "unauthenticated" ? "unauthorized" : "not_verified", reason: access.reason },
      { status: access.reason === "unauthenticated" ? 401 : 403 },
    );
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(48, Math.max(1, Number(url.searchParams.get("limit") || 24)));

  const params: any[] = [];
  let where = `WHERE status = 'active' AND published_at IS NOT NULL`;
  if (cursor) {
    params.push(cursor);
    where += ` AND published_at < $${params.length}`;
  }
  params.push(limit);

  const { rows } = await adultQuery<Row>(
    `SELECT id::text, creator_user_id::text, kind, title, preview_media_key,
            price_minor, currency, requires_subscription,
            duration_seconds, unlock_count, tip_total_minor,
            published_at::text
       FROM adult.posts
       ${where}
       ORDER BY published_at DESC
       LIMIT $${params.length}`,
    params,
  );

  const items = await Promise.all(rows.map(async (r) => {
    let previewUrl: string | null = null;
    if (r.preview_media_key) {
      try { previewUrl = await signAdultGet(r.preview_media_key, 900); } catch { previewUrl = null; }
    }
    return {
      id: r.id,
      creatorUserId: r.creator_user_id,
      kind: r.kind,
      title: r.title,
      previewUrl,
      priceMinor: r.price_minor,
      currency: r.currency,
      requiresSubscription: r.requires_subscription,
      durationSeconds: r.duration_seconds,
      unlockCount: r.unlock_count,
      tipTotalMinor: r.tip_total_minor,
      publishedAt: r.published_at,
    };
  }));

  const nextCursor = items.length === limit ? items[items.length - 1].publishedAt : null;
  return NextResponse.json(
    { items, nextCursor },
    { headers: { "cache-control": "private, no-store" } },
  );
}
