/**
 * Single adult post detail.
 *
 * Returns:
 *   - preview_url (signed) always when post is active
 *   - premium_url (signed) only when:
 *       (a) viewer is the creator, OR
 *       (b) post requires_subscription = true AND viewer has an active
 *           subscription to the creator, OR
 *       (c) viewer has a ppv_unlocks row for this post.
 *
 * Viewer must be age-verified.
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getAdultAccess } from "@/lib/adult/gate";
import { adultQuery } from "@/lib/adult/db";
import { signAdultGet } from "@/lib/adult/storageSign";

export const dynamic = "force-dynamic";

interface PostRow {
  id: string;
  creator_user_id: string;
  kind: string;
  title: string;
  description: string | null;
  preview_media_key: string | null;
  premium_media_key: string | null;
  price_minor: number;
  currency: string;
  requires_subscription: boolean;
  subscription_tier_minor: number | null;
  duration_seconds: number | null;
  status: string;
  published_at: string | null;
  unlock_count: number;
  tip_total_minor: number;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  const access = await getAdultAccess();
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === "unauthenticated" ? "unauthorized" : "not_verified" },
      { status: access.reason === "unauthenticated" ? 401 : 403 },
    );
  }
  const viewer = await getAuthUser();

  const { rows } = await adultQuery<PostRow>(
    `SELECT id::text, creator_user_id::text, kind, title, description,
            preview_media_key, premium_media_key,
            price_minor, currency, requires_subscription, subscription_tier_minor,
            duration_seconds, status, published_at::text,
            unlock_count, tip_total_minor
       FROM adult.posts WHERE id = $1`,
    [id],
  );
  const post = rows[0];
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (post.status !== "active" && post.creator_user_id !== viewer.userId) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  let isOwner = viewer.userId === post.creator_user_id;
  let hasSubscription = false;
  let hasPpv = false;

  if (!isOwner && viewer.userId && post.requires_subscription) {
    const { rows: sub } = await adultQuery<{ id: string }>(
      `SELECT id::text FROM adult.subscriptions
        WHERE fan_user_id = $1 AND creator_user_id = $2
          AND status = 'active' AND current_period_end > now()
        LIMIT 1`,
      [viewer.userId, post.creator_user_id],
    ).catch(() => ({ rows: [] as { id: string }[] }));
    hasSubscription = sub.length > 0;
  }
  if (!isOwner && viewer.userId && !post.requires_subscription && post.price_minor > 0) {
    const { rows: ppv } = await adultQuery<{ id: string }>(
      `SELECT id::text FROM adult.ppv_unlocks
        WHERE fan_user_id = $1 AND post_id = $2
        LIMIT 1`,
      [viewer.userId, post.id],
    ).catch(() => ({ rows: [] as { id: string }[] }));
    hasPpv = ppv.length > 0;
  }

  // Free post (no subscription required AND price 0) is unlocked for any verified viewer.
  const isFree = !post.requires_subscription && post.price_minor === 0;
  const unlocked = isOwner || hasSubscription || hasPpv || isFree;

  let previewUrl: string | null = null;
  let premiumUrl: string | null = null;
  try {
    if (post.preview_media_key) previewUrl = await signAdultGet(post.preview_media_key, 900);
  } catch {}
  if (unlocked && post.premium_media_key) {
    try { premiumUrl = await signAdultGet(post.premium_media_key, 900); } catch {}
  }

  return NextResponse.json({
    id: post.id,
    creatorUserId: post.creator_user_id,
    kind: post.kind,
    title: post.title,
    description: post.description,
    previewUrl,
    premiumUrl,
    priceMinor: post.price_minor,
    currency: post.currency,
    requiresSubscription: post.requires_subscription,
    subscriptionTierMinor: post.subscription_tier_minor,
    durationSeconds: post.duration_seconds,
    publishedAt: post.published_at,
    unlockCount: post.unlock_count,
    tipTotalMinor: post.tip_total_minor,
    unlocked,
    isOwner,
  }, { headers: { "cache-control": "private, no-store" } });
}
