/**
 * DM repository — conversations, participants, messages.
 *
 * Auth: callers must pass a real userId (resolved upstream via
 * getOrCreateSocialUser / getOptionalSocialUserId). All read/write
 * helpers enforce that the viewer is a participant of the conversation.
 */

import { dbQuery } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export type ConversationRow = {
  id: string;
  kind: "dm" | "group";
  created_by: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  reply_to_message_id: string | null;
  status: "sent" | "edited" | "deleted";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ConversationSummary = {
  id: string;
  kind: "dm" | "group";
  last_message_at: string | null;
  created_at: string;
  peer: {
    user_id: string | null;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  last_message: {
    id: string;
    sender_id: string;
    body: string;
    created_at: string;
  } | null;
  unread_count: number;
};

export type MessageWithSender = MessageRow & {
  sender: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};

export async function assertParticipant(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await dbQuery(
    `SELECT 1 FROM conversation_participants
       WHERE conversation_id = $1 AND user_id = $2
       LIMIT 1`,
    [conversationId, userId],
  );
  return rows.length > 0;
}

export async function getOrCreateDmConversation(
  viewerId: string,
  peerId: string,
): Promise<{ conversationId: string; isNew: boolean }> {
  if (!viewerId || !peerId || viewerId === peerId) {
    throw new Error("Invalid DM participants");
  }

  // Check existence first so we can report isNew.
  const existing = await dbQuery<{ id: string }>(
    `SELECT c.id
       FROM conversations c
       JOIN conversation_participants pa
         ON pa.conversation_id = c.id AND pa.user_id = $1
       JOIN conversation_participants pb
         ON pb.conversation_id = c.id AND pb.user_id = $2
      WHERE c.kind = 'dm'
        AND (SELECT COUNT(*) FROM conversation_participants p WHERE p.conversation_id = c.id) = 2
      LIMIT 1`,
    [viewerId, peerId],
  );

  if (existing.rows[0]?.id) {
    return { conversationId: existing.rows[0].id, isNew: false };
  }

  const { rows } = await dbQuery<{ get_or_create_dm: string }>(
    `SELECT get_or_create_dm($1::uuid, $2::uuid) AS get_or_create_dm`,
    [viewerId, peerId],
  );
  return { conversationId: rows[0].get_or_create_dm, isNew: true };
}

export async function listConversations(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<ConversationSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const cursor = opts.cursor || null;

  const { rows } = await dbQuery<any>(
    `WITH my_convs AS (
        SELECT cp.conversation_id, cp.last_read_at
          FROM conversation_participants cp
         WHERE cp.user_id = $1
      ),
      last_msgs AS (
        SELECT DISTINCT ON (m.conversation_id)
               m.conversation_id, m.id, m.sender_id, m.body, m.created_at
          FROM messages m
          JOIN my_convs mc ON mc.conversation_id = m.conversation_id
         WHERE m.status <> 'deleted'
         ORDER BY m.conversation_id, m.created_at DESC
      ),
      peers AS (
        SELECT cp.conversation_id, u.id AS peer_id, u.username, u.display_name,
               cpr.avatar_url
          FROM conversation_participants cp
          JOIN my_convs mc ON mc.conversation_id = cp.conversation_id
          JOIN users u ON u.id = cp.user_id AND u.id <> $1
          LEFT JOIN creator_profiles cpr ON cpr.user_id = u.id
      )
      SELECT c.id, c.kind, c.last_message_at, c.created_at,
             p.peer_id, p.username, p.display_name, p.avatar_url,
             lm.id AS last_message_id, lm.sender_id AS last_sender_id,
             lm.body AS last_body, lm.created_at AS last_created_at,
             (
               SELECT COUNT(*)::int FROM messages m2
                WHERE m2.conversation_id = c.id
                  AND m2.sender_id <> $1
                  AND m2.status <> 'deleted'
                  AND m2.created_at > COALESCE(mc.last_read_at, '1970-01-01'::timestamptz)
             ) AS unread_count
        FROM conversations c
        JOIN my_convs mc ON mc.conversation_id = c.id
        LEFT JOIN peers p ON p.conversation_id = c.id
        LEFT JOIN last_msgs lm ON lm.conversation_id = c.id
       WHERE ($2::timestamptz IS NULL OR c.last_message_at < $2::timestamptz)
       ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
       LIMIT $3`,
    [userId, cursor, limit],
  );

  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    last_message_at: r.last_message_at,
    created_at: r.created_at,
    peer: r.peer_id
      ? {
          user_id: r.peer_id,
          username: r.username,
          display_name: r.display_name,
          avatar_url: r.avatar_url,
        }
      : null,
    last_message: r.last_message_id
      ? {
          id: r.last_message_id,
          sender_id: r.last_sender_id,
          body: r.last_body,
          created_at: r.last_created_at,
        }
      : null,
    unread_count: Number(r.unread_count || 0),
  }));
}

export async function listMessages(
  conversationId: string,
  viewerId: string,
  opts: { limit?: number; beforeCursor?: string | null } = {},
): Promise<MessageWithSender[]> {
  const ok = await assertParticipant(conversationId, viewerId);
  if (!ok) {
    const err: any = new Error("Not a participant");
    err.status = 403;
    throw err;
  }

  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const before = opts.beforeCursor || null;

  const { rows } = await dbQuery<any>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.media_url,
            m.reply_to_message_id, m.status, m.metadata,
            m.created_at, m.updated_at,
            u.username AS sender_username,
            u.display_name AS sender_display_name,
            cpr.avatar_url AS sender_avatar_url
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN creator_profiles cpr ON cpr.user_id = u.id
      WHERE m.conversation_id = $1
        AND ($2::timestamptz IS NULL OR m.created_at < $2::timestamptz)
      ORDER BY m.created_at DESC
      LIMIT $3`,
    [conversationId, before, limit],
  );

  return rows
    .map((r: any) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      sender_id: r.sender_id,
      body: r.body,
      media_url: r.media_url,
      reply_to_message_id: r.reply_to_message_id,
      status: r.status,
      metadata: r.metadata || {},
      created_at: r.created_at,
      updated_at: r.updated_at,
      sender: {
        id: r.sender_id,
        username: r.sender_username,
        display_name: r.sender_display_name,
        avatar_url: r.sender_avatar_url,
      },
    }))
    .reverse(); // oldest -> newest for client consumption
}

export async function sendMessage(
  senderId: string,
  conversationId: string,
  data: { body: string; mediaUrl?: string | null; replyToMessageId?: string | null },
): Promise<MessageRow> {
  const body = (data.body || "").trim();
  if (!body || body.length > 4000) {
    const err: any = new Error("Invalid message body");
    err.status = 400;
    throw err;
  }

  const ok = await assertParticipant(conversationId, senderId);
  if (!ok) {
    const err: any = new Error("Not a participant");
    err.status = 403;
    throw err;
  }

  const { rows } = await dbQuery<MessageRow>(
    `INSERT INTO messages (conversation_id, sender_id, body, media_url, reply_to_message_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, conversation_id, sender_id, body, media_url,
               reply_to_message_id, status, metadata, created_at, updated_at`,
    [
      conversationId,
      senderId,
      body,
      data.mediaUrl || null,
      data.replyToMessageId || null,
    ],
  );

  const message = rows[0];

  await dbQuery(
    `UPDATE conversations
        SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [conversationId],
  );

  // Best-effort publish to redis pub/sub for SSE consumers.
  try {
    const redis = getRedis();
    await redis.publish(`dm:conv:${conversationId}`, JSON.stringify(message));
  } catch (err: any) {
    console.error("[dm] redis publish failed:", err?.message || err);
  }

  return message;
}

export async function markRead(
  conversationId: string,
  viewerId: string,
): Promise<{ last_read_at: string } | null> {
  const ok = await assertParticipant(conversationId, viewerId);
  if (!ok) {
    const err: any = new Error("Not a participant");
    err.status = 403;
    throw err;
  }
  const { rows } = await dbQuery<{ last_read_at: string }>(
    `UPDATE conversation_participants
        SET last_read_at = NOW()
      WHERE conversation_id = $1 AND user_id = $2
      RETURNING last_read_at`,
    [conversationId, viewerId],
  );
  return rows[0] ?? null;
}

export async function getPeerUserId(
  conversationId: string,
  viewerId: string,
): Promise<string | null> {
  const { rows } = await dbQuery<{ user_id: string }>(
    `SELECT user_id FROM conversation_participants
      WHERE conversation_id = $1 AND user_id <> $2
      LIMIT 1`,
    [conversationId, viewerId],
  );
  return rows[0]?.user_id ?? null;
}
