import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getVideoAssetUrl } from "@/lib/storage/video-storage";
import { loadOwnedVideo } from "@/lib/video/auth";
import { VIDEO_LIMITS } from "@/lib/video/limits";
import { putSmallObject } from "@/lib/video/storage-multipart";
import { coverObjectKey, isJpeg } from "@/lib/video/cover";
import { errorResponse, guardAuthor, jsonError, validId } from "@/lib/video/upload/http";

export const dynamic = "force-dynamic";

/**
 * PUT — coperta aleasă de creator (cadru capturat în browser, JPEG).
 * Workerul nu o mai suprascrie (metadata.cover_source = 'custom').
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await guardAuthor("creatorVideoEdit");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!validId(id)) return jsonError(400, "invalid_id");
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > VIDEO_LIMITS.coverMaxBytes) return jsonError(413, "cover_too_large");
  try {
    const owned = await loadOwnedVideo(id, guard.author);
    if (!owned) return jsonError(404, "not_found");
    if (owned === "forbidden") return jsonError(403, "forbidden");
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > VIDEO_LIMITS.coverMaxBytes) return jsonError(413, "cover_too_large");
    if (!isJpeg(bytes)) return jsonError(415, "cover_not_jpeg");
    const key = coverObjectKey(id, randomUUID());
    await putSmallObject(key, bytes, "image/jpeg");
    const url = getVideoAssetUrl(key);
    await dbQuery(
      `UPDATE videos
          SET thumbnail_url = $2,
              metadata = metadata || jsonb_build_object('cover_source', 'custom', 'cover_key', $3::text),
              updated_at = NOW()
        WHERE id = $1`,
      [id, url, key],
    );
    return NextResponse.json({ thumbnailUrl: url });
  } catch (err) {
    return errorResponse(err, "cover");
  }
}
