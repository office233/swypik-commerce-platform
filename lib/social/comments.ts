export type CommentStatus = "visible" | "hidden" | "deleted" | "flagged";

export type CommentValidationResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export type CommentAuthor = {
  id: string | null;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export type CommentView = {
  id: string;
  videoId: string;
  userId: string | null;
  parentCommentId: string | null;
  text: string;
  status: CommentStatus;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  author: CommentAuthor;
  replies: CommentView[];
};

const MAX_COMMENT_LENGTH = 500;
const FLAGGED_TERMS = [
  "scam",
  "fake",
  "frauda",
  "teapa",
  "țeapă",
  "spam",
  "http://",
  "https://",
];

function toNonNegativeNumber(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toISOString?: unknown }).toISOString === "function") {
    return (value as { toISOString: () => string }).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

export function validateCommentText(input: unknown): CommentValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "Comment text is required" };
  }

  const text = input.replace(/\s+/g, " ").trim();
  if (!text) {
    return { ok: false, error: "Comment text is required" };
  }

  if (text.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: "Comment text must be 500 characters or less" };
  }

  return { ok: true, text };
}

export function chooseCommentStatus(text: string): CommentStatus {
  const normalized = text.toLowerCase();
  return FLAGGED_TERMS.some((term) => normalized.includes(term)) ? "flagged" : "visible";
}

export function mapCommentRow(row: any): CommentView {
  const displayName = String(row.display_name || row.username || "Comunitate");

  return {
    id: String(row.id),
    videoId: String(row.video_id),
    userId: row.user_id ? String(row.user_id) : null,
    parentCommentId: row.parent_comment_id ? String(row.parent_comment_id) : null,
    text: String(row.body || ""),
    status: (row.status || "visible") as CommentStatus,
    likeCount: toNonNegativeNumber(row.like_count),
    replyCount: toNonNegativeNumber(row.reply_count),
    createdAt: toIsoString(row.created_at),
    author: {
      id: row.user_id ? String(row.user_id) : null,
      username: row.username ? String(row.username) : null,
      displayName,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    },
    replies: [],
  };
}

export function attachReplies(topLevelRows: any[], replyRows: any[]): CommentView[] {
  const comments = topLevelRows.map(mapCommentRow);
  const byId = new Map(comments.map((comment) => [comment.id, comment]));

  for (const row of replyRows) {
    const reply = mapCommentRow(row);
    const parent = reply.parentCommentId ? byId.get(reply.parentCommentId) : null;
    if (parent) parent.replies.push(reply);
  }

  return comments;
}
