/**
 * Decizia de moderare pe un clip: aprobare / respingere.
 * Folosită de consola de admin (/api/admin/moderation/videos/[id]) și de
 * Multi-ERP (/api/internal/moderation/decide, type "video") — o singură regulă.
 *
 * Acoperă ambele cozi:
 *   - „în așteptare”: videos.moderation_status = 'pending_review' (upload nou);
 *   - „semnalate”: cazuri deschise în moderation_cases pe clip (AI / rapoarte).
 *
 * Aprobare: clipul devine public (visibility, is_draft, published_at) dacă era
 * în așteptare; cazurile deschise se închid fără acțiune.
 * Respingere: moderation_status = 'rejected' + ascuns; cazurile se închid cu 'hide'.
 */
import { withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyFollowersNewPost } from "@/lib/notifications/dispatch";
import { notifyLocalized } from "@/lib/notifications/localized";

export type VideoDecision = "approve" | "reject";

export type VideoDecisionResult =
  | {
      ok: true;
      videoId: string;
      creatorId: string | null;
      title: string | null;
      /** Clipul tocmai a fost publicat (era în așteptare și a fost aprobat). */
      published: boolean;
      casesClosed: number;
    }
  | { ok: false; error: "not_found" | "already_decided" };

type VideoRow = { id: string; creator_id: string | null; title: string | null; moderation_status: string };

export async function decideVideo(args: {
  videoId: string;
  decision: VideoDecision;
  reason: string | null;
  actorUserId: string | null;
}): Promise<VideoDecisionResult> {
  const { videoId, decision, reason, actorUserId } = args;
  const approve = decision === "approve";

  return withTransaction<VideoDecisionResult>(async (q) => {
    const { rows } = await q<VideoRow>(
      `SELECT id::text, creator_id::text, title, moderation_status
         FROM videos WHERE id = $1 AND COALESCE(status, '') <> 'deleted' FOR UPDATE`,
      [videoId],
    );
    const v = rows[0];
    if (!v) return { ok: false, error: "not_found" };

    const { rows: openCases } = await q<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM moderation_cases
        WHERE target_video_id = $1 AND status IN ('open', 'in_review')`,
      [videoId],
    );
    const pending = v.moderation_status === "pending_review";
    if (!pending && (openCases[0]?.c ?? 0) === 0) return { ok: false, error: "already_decided" };

    if (approve && pending) {
      // Feed-ul filtrează pe visibility='public' — aprobarea trebuie să și publice clipul.
      await q(
        `UPDATE videos
            SET moderation_status = 'approved', visibility = 'public', is_draft = false,
                published_at = COALESCE(published_at, now()),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('moderation_reason', $2::text),
                updated_at = now()
          WHERE id = $1`,
        [videoId, reason ?? ""],
      );
    } else if (!approve) {
      await q(
        `UPDATE videos
            SET moderation_status = 'rejected', is_hidden = true, hidden_at = COALESCE(hidden_at, now()),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('moderation_reason', $2::text),
                updated_at = now()
          WHERE id = $1`,
        [videoId, reason ?? ""],
      );
      await q(
        `INSERT INTO moderation_actions (actor_user_id, target_video_id, action_type, reason)
         VALUES ($1, $2, 'hide', $3)`,
        [actorUserId, videoId, reason],
      );
    }

    const closed = await q(
      `UPDATE moderation_cases
          SET status = 'resolved', decision = $2, resolution_note = $3,
              resolved_by_user_id = $4, resolved_at = now(), updated_at = now()
        WHERE target_video_id = $1 AND status IN ('open', 'in_review')`,
      [videoId, approve ? "no_action" : "hide", reason, actorUserId],
    );

    return {
      ok: true,
      videoId: v.id,
      creatorId: v.creator_id,
      title: v.title,
      published: approve && pending,
      casesClosed: closed.rowCount ?? 0,
    };
  });
}

/** Efecte după commit (best-effort): anunț către urmăritori la publicare, notificare la respingere. */
export async function afterVideoDecision(
  result: Extract<VideoDecisionResult, { ok: true }>,
  decision: VideoDecision,
): Promise<void> {
  if (!result.creatorId) return;
  if (decision === "approve" && result.published) {
    // Fan-out-ul poate atinge sute de urmăritori — nu ține cererea de admin.
    void notifyFollowersNewPost(result.creatorId, result.videoId, { title: result.title ?? undefined }).catch((err) =>
      logger.warn({ err, videoId: result.videoId }, "[moderation] new_post fan-out failed"),
    );
  } else if (decision === "reject") {
    await notifyLocalized(result.creatorId, "videoRejected", { url: "/creator" });
  }
}
