import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getCreatorUserIdWithRoleCheck } from "@/lib/creator/session";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_VISIBILITY = new Set(["draft", "unlisted", "public", "private"]);

type PatchBody = {
  visibility?: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  scheduled_at?: string | null;
  tags?: string[];
};

function sanitizeString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

/**
 * PATCH /api/creator/videos/[id]
 *
 * Updates an owned video. Allowed fields: visibility, title, description,
 * thumbnail_url, tags, scheduled_at. Requires creator/admin role and
 * ownership of the video (admins may update any video).
 *
 * When visibility transitions to `public` and `published_at` is null, sets
 * `published_at = now()`.
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

    // Ownership check.
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

    // Build dynamic update.
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (body.visibility !== undefined) {
      if (typeof body.visibility !== "string" || !ALLOWED_VISIBILITY.has(body.visibility)) {
        return NextResponse.json(
          { error: "Invalid visibility" },
          { status: 400 },
        );
      }
      sets.push(`visibility = $${i++}`);
      values.push(body.visibility);
      // Auto-set published_at when first going public.
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
      const desc = body.description == null
        ? null
        : body.description.slice(0, 5000);
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
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 64)
        .slice(0, 30);
      sets.push(`tags = $${i++}::text[]`);
      values.push(cleaned);
    }

    if (body.scheduled_at !== undefined) {
      if (body.scheduled_at !== null && typeof body.scheduled_at !== "string") {
        return NextResponse.json({ error: "Invalid scheduled_at" }, { status: 400 });
      }
      sets.push(`metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{scheduled_at}', to_jsonb($${i++}::text))`);
      values.push(body.scheduled_at);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    sets.push(`updated_at = now()`);
    values.push(videoId);

    const sql = `UPDATE videos SET ${sets.join(", ")} WHERE id = $${i} RETURNING id, creator_id, title, description, thumbnail_url, visibility, status, tags, published_at, updated_at`;
    const { rows: updated } = await dbQuery(sql, values);

    return NextResponse.json({ success: true, video: updated[0] });
  } catch (err: any) {
    logger.error({ err }, "[creator/videos/:id PATCH] error");
    const status = typeof err?.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: status === 500 ? "Internal error" : err.message },
      { status },
    );
  }
}
