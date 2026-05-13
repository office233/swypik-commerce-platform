/**
 * Notification dispatcher.
 *
 * Persists an in-app notification row (existing `notifications` table) and
 * fires a Web Push notification (fire-and-forget). Self-notifications are
 * skipped.
 */

import { dbQuery } from "@/lib/db";
import { sendPushToUser, type PushPayload } from "@/lib/push/web-push";

// Mapped to the existing notifications.notification_type CHECK constraint.
export type NotificationType =
  | "comment"
  | "reply"
  | "like"
  | "follow"
  | "share"
  | "commission"
  | "system"
  | "upload_processed";

export type NotifyInput = {
  type: NotificationType;
  actorUserId?: string | null;
  /** Either "video" or "comment"; mapped to dedicated FK cols. */
  targetType?: "video" | "comment" | null;
  targetId?: string | null;
  /** Stored in notifications.metadata; may contain title/body/url overrides. */
  payload?: Record<string, unknown>;
};

const TITLES: Record<NotificationType, string> = {
  comment: "Comentariu nou",
  reply: "Răspuns nou la comentariul tău",
  like: "Cineva ți-a dat like",
  follow: "Ai un nou follower",
  share: "Cineva a distribuit ceva ce ai postat",
  commission: "Comision nou",
  system: "Notificare",
  upload_processed: "Videoclipul tău este gata",
};

export async function notifyUser(
  recipientUserId: string,
  input: NotifyInput,
): Promise<void> {
  if (!recipientUserId) return;
  if (input.actorUserId && input.actorUserId === recipientUserId) return;

  const payload = input.payload || {};
  const title = (payload.title as string) || TITLES[input.type];
  const body = (payload.body as string) || "";
  const actionUrl = (payload.url as string) || null;
  const videoId = input.targetType === "video" ? input.targetId : null;
  const commentId = input.targetType === "comment" ? input.targetId : null;

  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO notifications
       (user_id, actor_user_id, notification_type, title, body,
        video_id, comment_id, action_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id`,
    [
      recipientUserId,
      input.actorUserId || null,
      input.type,
      title,
      body,
      videoId,
      commentId,
      actionUrl,
      JSON.stringify(payload),
    ],
  );

  const notificationId = rows[0]?.id;
  const pushPayload: PushPayload = {
    title,
    body,
    url: actionUrl || "/notifications",
    tag: `${input.type}:${input.targetId || notificationId}`,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge.png",
    notificationId,
    type: input.type,
  };

  void sendPushToUser(recipientUserId, pushPayload).catch((err) => {
    console.warn("[notifyUser] push failed:", err?.message || err);
  });
}
