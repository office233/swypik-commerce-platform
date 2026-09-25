/**
 * PATCH /api/creator/videos/[id] — detaliile clipului + intenția de publicare.
 *
 * - `publish: "public"` e permis cât timp clipul se procesează: apare în feed
 *   singur când devine 'ready' (feed-ul cere status='ready').
 * - Publicarea (public/programat/unlisted) rulează moderarea pe textul final.
 * - Produsul etichetat trebuie să fie eligibil pentru feed (altfel ar ascunde clipul).
 * - Programarea cere o dată viitoare.
 */
import { dbQuery, getDb } from "@/lib/db";
import { autoEmbedVideo } from "@/lib/ai/auto-embed";
import type { OwnedVideo } from "@/lib/video/auth";
import { moderateOnPublish, type ModerationDecision } from "@/lib/video/moderation-gate";
import { isFeedEligibleProduct } from "@/lib/video/product-eligibility";
import { notifyFollowersOnce } from "@/lib/video/publish-notify";
import { UploadInputError } from "@/lib/video/upload-session";
import type { VideoDetailsInput } from "@/lib/video/upload/schemas";

const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_SCHEDULE_AHEAD_MS = 60 * 1000;

export type DetailsUpdate = { sets: string[]; values: unknown[]; publishing: boolean };

/** Construiește UPDATE-ul (pur, testabil). `$1` e rezervat pentru id-ul clipului. */
export function buildDetailsUpdate(input: VideoDetailsInput, video: OwnedVideo, now = Date.now()): DetailsUpdate {
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (clause: (n: number) => string, value: unknown) => {
    values.push(value);
    sets.push(clause(values.length + 1));
  };

  if (input.title !== undefined && input.title) push((n) => `title = $${n}`, input.title);
  if (input.description !== undefined) push((n) => `description = $${n}`, input.description ?? "");
  if (input.tags !== undefined) {
    const tags = Array.from(new Set(input.tags.map((t) => t.replace(/^#/, "").toLowerCase()).filter(Boolean)));
    push((n) => `tags = $${n}::text[]`, tags);
  }
  if (input.allow_comments !== undefined) push((n) => `allow_comments = $${n}`, input.allow_comments);
  if (input.allow_duet !== undefined) push((n) => `allow_duet = $${n}`, input.allow_duet);
  if (input.allow_stitch !== undefined) push((n) => `allow_stitch = $${n}`, input.allow_stitch);
  if (input.audio_track_id !== undefined) push((n) => `audio_track_id = $${n}`, input.audio_track_id);
  if (input.product_id === null) sets.push(`product_refs = '[]'::jsonb`);
  else if (input.product_id) {
    push((n) => `product_refs = jsonb_build_array(jsonb_build_object('product_id', $${n}::text, 'source', 'creator_upload'))`, input.product_id);
  }
  const meta: Record<string, unknown> = {};
  if (input.captions_enabled !== undefined) meta.captions_enabled = input.captions_enabled;
  if (input.collection_hint !== undefined) meta.collection_hint = input.collection_hint;
  if (Object.keys(meta).length) push((n) => `metadata = metadata || $${n}::jsonb`, JSON.stringify(meta));
  if (input.ai_hook_selected !== undefined) push((n) => `ai_hook_selected = $${n}`, input.ai_hook_selected);
  if (input.ai_caption_used !== undefined) push((n) => `ai_caption_used = $${n}`, input.ai_caption_used);

  const intent = input.publish;
  if (intent) {
    if (intent !== "draft" && (video.status === "uploading" || video.status === "failed")) {
      throw new UploadInputError("video not uploaded", video.status === "failed" ? "video_failed" : "not_uploaded", 409);
    }
    if (intent === "scheduled") {
      const at = input.scheduled_publish_at ? Date.parse(input.scheduled_publish_at) : NaN;
      if (!Number.isFinite(at) || at < now + MIN_SCHEDULE_AHEAD_MS || at > now + MAX_SCHEDULE_AHEAD_MS) {
        throw new UploadInputError("schedule must be in the future", "invalid_schedule");
      }
      push((n) => `scheduled_publish_at = $${n}::timestamptz`, new Date(at).toISOString());
      sets.push(`visibility = 'draft'`, `is_draft = false`);
    } else {
      sets.push(`scheduled_publish_at = NULL`);
      push((n) => `visibility = $${n}`, intent === "public" ? "public" : intent);
      sets.push(`is_draft = ${intent === "draft" ? "true" : "false"}`);
      if (intent === "public") sets.push(`published_at = COALESCE(published_at, NOW())`);
    }
  }

  if (sets.length === 0) throw new UploadInputError("no fields", "no_fields");
  sets.push("updated_at = NOW()");
  return { sets, values, publishing: intent === "public" || intent === "scheduled" || intent === "unlisted" };
}

export type ApplyResult = {
  videoId: string;
  status: string;
  visibility: string;
  moderationStatus: ModerationDecision | string;
  /** Clipul se vede acum în feed (ready + public + aprobat). */
  liveNow: boolean;
};

export async function applyVideoDetails(video: OwnedVideo, input: VideoDetailsInput): Promise<ApplyResult> {
  if (input.product_id && !(await isFeedEligibleProduct(input.product_id))) {
    throw new UploadInputError("product not eligible", "product_not_eligible", 422);
  }
  const update = buildDetailsUpdate(input, video);

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE videos SET ${update.sets.join(", ")} WHERE id = $1`, [video.id, ...update.values]);
    if (input.product_id !== undefined) {
      await client.query(`DELETE FROM video_product_links WHERE video_id = $1 AND placement = 'overlay'`, [video.id]);
      if (input.product_id) {
        await client.query(
          `INSERT INTO video_product_links (video_id, product_id, placement, start_ms, end_ms, sort_order, metadata)
           VALUES ($1, $2::uuid, 'overlay', $3, NULL, 0, '{}'::jsonb) ON CONFLICT DO NOTHING`,
          [video.id, input.product_id, input.product_overlay_ms ?? 0],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const { rows } = await dbQuery<{ status: string; visibility: string; moderation_status: string; title: string; description: string | null; tags: string[] | null }>(
    `SELECT status, visibility, moderation_status, title, description, tags FROM videos WHERE id = $1`,
    [video.id],
  );
  const fresh = rows[0];
  let moderation: string = fresh.moderation_status;
  if (update.publishing) {
    moderation = await moderateOnPublish({
      videoId: video.id,
      creatorId: video.creator_id,
      currentStatus: fresh.moderation_status,
      title: fresh.title,
      description: fresh.description ?? "",
      tags: fresh.tags ?? [],
    });
    await dbQuery(`UPDATE videos SET moderation_status = $2, updated_at = NOW() WHERE id = $1`, [video.id, moderation]);
  }
  if (input.title !== undefined || input.description !== undefined) {
    autoEmbedVideo(video.id, fresh.title, fresh.description ?? "");
  }
  const liveNow = fresh.status === "ready" && fresh.visibility === "public" && moderation === "approved";
  if (liveNow) await notifyFollowersOnce(video.id);
  return { videoId: video.id, status: fresh.status, visibility: fresh.visibility, moderationStatus: moderation, liveNow };
}
