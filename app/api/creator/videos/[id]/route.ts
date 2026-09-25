import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { loadOwnedVideo } from "@/lib/video/auth";
import { applyVideoDetails } from "@/lib/video/publish";
import { errorResponse, guardAuthor, jsonError, readJson, validId } from "@/lib/video/upload/http";
import { VideoDetailsSchema } from "@/lib/video/upload/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Clipul propriu (draft, programat, publicat) — folosit la reluarea unui draft în wizard. */
export async function GET(_req: Request, ctx: Ctx) {
  const guard = await guardAuthor();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!validId(id)) return jsonError(400, "invalid_id");
  try {
    const owned = await loadOwnedVideo(id, guard.author);
    if (!owned) return jsonError(404, "not_found");
    if (owned === "forbidden") return jsonError(403, "forbidden");
    const { rows } = await dbQuery(
      `SELECT v.id, v.title, v.description, v.thumbnail_url, v.playback_url, v.visibility, v.status,
              v.moderation_status, v.tags, v.published_at, v.scheduled_publish_at, v.is_draft,
              v.allow_duet, v.allow_stitch, v.allow_comments, v.audio_track_id, v.product_refs,
              v.duration_ms, v.width, v.height, v.metadata->>'mission_slug' AS mission_slug,
              COALESCE((v.metadata->>'captions_enabled')::boolean, false) AS captions_enabled,
              v.metadata->>'preview_url' AS preview_url,
              (SELECT vpl.start_ms FROM video_product_links vpl
                WHERE vpl.video_id = v.id AND vpl.placement = 'overlay' ORDER BY vpl.sort_order LIMIT 1) AS product_overlay_ms,
              (SELECT p.title FROM marketplace_products p
                WHERE p.id::text = v.product_refs->0->>'product_id' LIMIT 1) AS product_title,
              (SELECT vus.id FROM video_upload_sessions vus
                WHERE vus.video_id = v.id ORDER BY vus.created_at DESC LIMIT 1) AS session_id,
              v.created_at, v.updated_at
         FROM videos v WHERE v.id = $1`,
      [id],
    );
    return NextResponse.json({ video: rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "video get");
  }
}

/** Detalii + publicare (draft / public / programat). Vezi lib/video/publish.ts. */
export async function PATCH(req: Request, ctx: Ctx) {
  const guard = await guardAuthor("creatorVideoEdit");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!validId(id)) return jsonError(400, "invalid_id");
  const body = await readJson(req, VideoDetailsSchema);
  if (!body.ok) return body.response;
  try {
    const owned = await loadOwnedVideo(id, guard.author);
    if (!owned) return jsonError(404, "not_found");
    if (owned === "forbidden") return jsonError(403, "forbidden");
    return NextResponse.json({ success: true, ...(await applyVideoDetails(owned, body.data)) });
  } catch (err) {
    return errorResponse(err, "video patch");
  }
}

/** Arhivare soft (status 'deleted', ascuns). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const guard = await guardAuthor("creatorVideoEdit");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!validId(id)) return jsonError(400, "invalid_id");
  try {
    const owned = await loadOwnedVideo(id, guard.author);
    if (!owned) return jsonError(404, "not_found");
    if (owned === "forbidden") return jsonError(403, "forbidden");
    await dbQuery(
      `UPDATE videos SET status = 'deleted', is_hidden = true, hidden_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err, "video delete");
  }
}
