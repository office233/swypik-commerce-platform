import { NextResponse } from "next/server";
import { autoEmbedVideo } from "@/lib/ai/auto-embed";
import { dbQuery } from "@/lib/db";
import { getCreatorUserIdWithRoleCheck } from "@/lib/creator/session";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_VISIBILITY = new Set(["draft", "unlisted", "public", "private"]);

type PatchBody = {
  visibility?: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  scheduled_at?: string | null;
  scheduled_publish_at?: string | null;
  is_draft?: boolean;
  allow_comments?: boolean;
  allow_duet?: boolean;
  allow_stitch?: boolean;
  audio_track_id?: number | null;
  product_id?: string | null;
  tags?: string[];
  ai_hook_selected?: string | null;
  ai_caption_used?: boolean;
  collection_hint?: string | null;
};

function sanitizeString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

/**
 * GET /api/creator/videos/[id]
 * Returns owned video status + metadata (used by upload wizard polling + draft load).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getCreatorUserIdWithRoleCheck();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: videoId } = await ctx.params;
    if (!videoId || !UUID_RE.test(videoId)) {
      return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
    }

    const { rows } = await dbQuery(
      `SELECT id, creator_id, title, description, thumbnail_url, playback_url,
              visibility, status, tags, published_at, scheduled_publish_at,
              is_draft, allow_duet, allow_stitch, allow_comments,
              audio_track_id, product_refs, created_at, updated_at
         FROM videos WHERE id = $1 LIMIT 1`,
      [videoId],
    );
    const v = rows[0];
    if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (v.creator_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ video: v, status: v.status });
  } catch (err) {
    logger.error({ err }, "[creator/videos/:id GET] error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/creator/videos/[id]
 *
 * Updates an owned video. Allowed fields: visibility, title, description,
 * thumbnail_url, tags, scheduled_at, is_draft, allow_*, audio_track_id, product_id.
 * Requires creator/admin role and ownership.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getCreatorUserIdWithRoleCheck();
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rl = await rateLimit("creatorVideoEdit", session.userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const { id: videoId } = await ctx.params;
    if (!videoId || !UUID_RE.test(videoId)) {
      return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
    }

    let body: PatchBody;
    try {
      body = (await req.json()) as PatchBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { rows: ownerRows } = await dbQuery<{
      creator_id: string;
      published_at: string | null;
    }>(
      `SELECT creator_id, published_at FROM videos WHERE id = $1 LIMIT 1`,
      [videoId],
    );
    const owner = ownerRows[0];
    if (!owner) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    if (owner.creator_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.visibility !== undefined) {
      if (typeof body.visibility !== "string" || !ALLOWED_VISIBILITY.has(body.visibility)) {
        return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
      }
      sets.push(`visibility = $${i++}`);
      values.push(body.visibility);
      if (body.visibility === "public" && !owner.published_at) {
        sets.push(`published_at = now()`);
      }
    }

    const title = sanitizeString(body.title, 300);
    if (title !== undefined) {
      sets.push(`title = $${i++}`);
      values.push(title);
    }

    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        return NextResponse.json({ error: "Invalid description" }, { status: 400 });
      }
      const desc = body.description == null ? null : body.description.slice(0, 5000);
      sets.push(`description = $${i++}`);
      values.push(desc);
    }

    if (body.thumbnail_url !== undefined) {
      if (body.thumbnail_url !== null && typeof body.thumbnail_url !== "string") {
        return NextResponse.json({ error: "Invalid thumbnail_url" }, { status: 400 });
      }
      sets.push(`thumbnail_url = $${i++}`);
      values.push(body.thumbnail_url);
    }

    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags) || !body.tags.every((t) => typeof t === "string")) {
        return NextResponse.json({ error: "Invalid tags" }, { status: 400 });
      }
      const cleaned = body.tags
        .map((t) => t.trim().replace(/^#/, ""))
        .filter((t) => t.length > 0 && t.length <= 64)
        .slice(0, 30);
      sets.push(`tags = $${i++}::text[]`);
      values.push(cleaned);
    }

    if (body.is_draft !== undefined) {
      if (typeof body.is_draft !== "boolean") {
        return NextResponse.json({ error: "Invalid is_draft" }, { status: 400 });
      }
      sets.push(`is_draft = $${i++}`);
      values.push(body.is_draft);
    }

    if (body.allow_comments !== undefined) {
      sets.push(`allow_comments = $${i++}`);
      values.push(!!body.allow_comments);
    }
    if (body.allow_duet !== undefined) {
      sets.push(`allow_duet = $${i++}`);
      values.push(!!body.allow_duet);
    }
    if (body.allow_stitch !== undefined) {
      sets.push(`allow_stitch = $${i++}`);
      values.push(!!body.allow_stitch);
    }

    if (body.audio_track_id !== undefined) {
      if (body.audio_track_id !== null && typeof body.audio_track_id !== "number") {
        return NextResponse.json({ error: "Invalid audio_track_id" }, { status: 400 });
      }
      sets.push(`audio_track_id = $${i++}`);
      values.push(body.audio_track_id);
    }

    if (body.product_id !== undefined) {
      if (body.product_id === null) {
        sets.push(`product_refs = '[]'::jsonb`);
      } else if (typeof body.product_id === "string" && body.product_id) {
        sets.push(`product_refs = jsonb_build_array(jsonb_build_object('product_id', $${i++}::text))`);
        values.push(body.product_id);
      }
    }

    if (body.scheduled_publish_at !== undefined) {
      if (body.scheduled_publish_at === null) {
        sets.push(`scheduled_publish_at = NULL`);
      } else if (typeof body.scheduled_publish_at === "string") {
        sets.push(`scheduled_publish_at = $${i++}::timestamptz`);
        values.push(body.scheduled_publish_at);
      } else {
        return NextResponse.json({ error: "Invalid scheduled_publish_at" }, { status: 400 });
      }
    }

    if (body.scheduled_at !== undefined) {
      if (body.scheduled_at !== null && typeof body.scheduled_at !== "string") {
        return NextResponse.json({ error: "Invalid scheduled_at" }, { status: 400 });
      }
      sets.push(`metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{scheduled_at}', to_jsonb($${i++}::text))`);
      values.push(body.scheduled_at);
    }

    if (body.ai_hook_selected !== undefined) {
      sets.push(`ai_hook_selected = $${i++}`);
      values.push(body.ai_hook_selected);
    }
    if (body.ai_caption_used !== undefined) {
      sets.push(`ai_caption_used = $${i++}`);
      values.push(!!body.ai_caption_used);
    }
    if (body.collection_hint !== undefined) {
      sets.push(`metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{collection_hint}', to_jsonb($${i++}::text))`);
      values.push(body.collection_hint);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    sets.push(`updated_at = now()`);
    values.push(videoId);

    const sql = `UPDATE videos SET ${sets.join(", ")} WHERE id = $${i} RETURNING id, creator_id, title, description, thumbnail_url, visibility, status, tags, published_at, updated_at, is_draft, scheduled_publish_at, allow_duet, allow_stitch, allow_comments`;
    const { rows: updated } = await dbQuery(sql, values);

    // Re-embed dacă title/description s-au schimbat
    const u = updated[0];
    if (u?.id && (sets.some((s: string) => /^title\s*=/.test(s) || /^description\s*=/.test(s)))) {
      autoEmbedVideo(u.id, u.title, u.description);
    }

    return NextResponse.json({ success: true, video: updated[0] });
  } catch (err) {
    logger.error({ err }, "[creator/videos/:id PATCH] error");
    const errObj = err as { status?: unknown; message?: unknown } | null;
    const status = typeof errObj?.status === "number" ? errObj.status : 500;
    const message = typeof errObj?.message === "string" ? errObj.message : "Internal error";
    return NextResponse.json(
      { error: status === 500 ? "Internal error" : message },
      { status },
    );
  }
}

/**
 * DELETE /api/creator/videos/[id]
 * Soft-archive a draft (or any owned video) — sets status='deleted', is_hidden=true.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getCreatorUserIdWithRoleCheck();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rl = await rateLimit("creatorVideoEdit", session.userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const { id: videoId } = await ctx.params;
    if (!videoId || !UUID_RE.test(videoId)) {
      return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
    }

    const { rows } = await dbQuery<{ creator_id: string }>(
      `SELECT creator_id FROM videos WHERE id = $1 LIMIT 1`,
      [videoId],
    );
    const v = rows[0];
    if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (v.creator_id !== session.userId && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbQuery(
      `UPDATE videos
          SET status = 'deleted', is_hidden = true, hidden_at = now(), updated_at = now()
        WHERE id = $1`,
      [videoId],
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "[creator/videos/:id DELETE] error");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
