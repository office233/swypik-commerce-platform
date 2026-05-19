/**
 * Adult posts API.
 *
 * POST — creator publishes a new post. Validates approved creator,
 *        requires at least one consent_release for active flow,
 *        inserts as status='pending_moderation' and enqueues for
 *        Sightengine review (best-effort).
 *
 * GET  — list current creator's own posts (newest first).
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";
import { writeAuditFromRequest } from "@/lib/adult/audit";

export const dynamic = "force-dynamic";

const KINDS = new Set(["photo_set", "video", "live", "ppv", "drop", "bundle"]);
const CURRENCIES = new Set(["EUR", "USD", "GBP"]);

interface CreateBody {
  kind?: string;
  title?: string;
  description?: string | null;
  preview_media_key?: string | null;
  premium_media_key?: string;
  duration_seconds?: number | null;
  price_minor?: number;
  currency?: string;
  requires_subscription?: boolean;
  subscription_tier_minor?: number | null;
  consent_release_ids?: string[];
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rows: kyc } = await adultQuery<{ status: string }>(
    `SELECT status FROM adult.creator_kyc WHERE user_id = $1`, [user.userId],
  );
  if (kyc[0]?.status !== "approved") {
    return NextResponse.json({ error: "creator_not_approved" }, { status: 403 });
  }

  let b: CreateBody;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!b.kind || !KINDS.has(b.kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  if (!b.title || b.title.trim().length < 3) return NextResponse.json({ error: "bad_title" }, { status: 400 });
  if (!b.premium_media_key) return NextResponse.json({ error: "missing_premium_media" }, { status: 400 });
  if (!b.premium_media_key.startsWith(`creators/${user.userId}/`)) {
    return NextResponse.json({ error: "media_key_owner_mismatch" }, { status: 400 });
  }
  if (b.preview_media_key && !b.preview_media_key.startsWith(`creators/${user.userId}/`)) {
    return NextResponse.json({ error: "preview_key_owner_mismatch" }, { status: 400 });
  }

  const currency = (b.currency || "EUR").toUpperCase();
  if (!CURRENCIES.has(currency)) return NextResponse.json({ error: "bad_currency" }, { status: 400 });

  const priceMinor = Math.max(0, Math.floor(Number(b.price_minor || 0)));
  const requiresSub = Boolean(b.requires_subscription);
  const subTier = b.subscription_tier_minor != null
    ? Math.max(0, Math.floor(Number(b.subscription_tier_minor))) : null;

  // Consent IDs must exist and belong to this creator, not revoked.
  const consentIds = Array.from(new Set((b.consent_release_ids || []).filter(s => typeof s === "string")));
  if (consentIds.length < 1) {
    return NextResponse.json({ error: "consent_required", message: "At least one consent release is required." }, { status: 400 });
  }
  const { rows: validConsent } = await adultQuery<{ id: string }>(
    `SELECT id::text FROM adult.consent_releases
      WHERE creator_user_id = $1 AND revoked_at IS NULL AND id::text = ANY($2::text[])`,
    [user.userId, consentIds],
  );
  if (validConsent.length !== consentIds.length) {
    return NextResponse.json({ error: "consent_invalid", message: "One or more consent IDs are invalid or revoked." }, { status: 400 });
  }

  const { rows } = await adultQuery<{ id: string }>(
    `INSERT INTO adult.posts
       (creator_user_id, kind, title, description,
        preview_media_key, premium_media_key, duration_seconds,
        price_minor, currency,
        requires_subscription, subscription_tier_minor,
        consent_release_ids, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::uuid[],'pending_moderation')
     RETURNING id::text`,
    [
      user.userId, b.kind, b.title.trim(), b.description ?? null,
      b.preview_media_key ?? null, b.premium_media_key, b.duration_seconds ?? null,
      priceMinor, currency,
      requiresSub, subTier,
      consentIds,
    ],
  );

  // Best-effort enqueue into moderation_queue (table exists per schema).
  await adultQuery(
    `INSERT INTO adult.moderation_queue (post_id) VALUES ($1)`,
    [rows[0].id],
  ).catch(() => {});

  await writeAuditFromRequest({
    actorUserId: user.userId,
    action: "post.created",
    targetType: "post",
    targetId: rows[0].id,
    afterState: { kind: b.kind, title: b.title, priceMinor, currency, requiresSub, consentCount: consentIds.length },
  }).catch(() => {});

  return NextResponse.json({ id: rows[0].id, status: "pending_moderation" });
}

export async function GET() {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await adultQuery(
    `SELECT id::text, kind, title, status,
            price_minor, currency, requires_subscription,
            created_at::text, published_at::text,
            unlock_count, tip_total_minor
       FROM adult.posts
      WHERE creator_user_id = $1
      ORDER BY created_at DESC
      LIMIT 200`,
    [user.userId],
  );
  return NextResponse.json({ items: rows });
}
