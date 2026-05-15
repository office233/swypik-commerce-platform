/**
 * POST /api/videos/[id]/report
 *
 * Submit a moderation report for a video.
 * Rate-limited 5/h per user (or IP for anon).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = new Set([
  "spam",
  "harassment",
  "hate",
  "violence",
  "sexual_content",
  "scam",
  "copyright",
  "other",
]);

const UI_TO_REASON: Record<string, string> = {
  spam: "spam",
  explicit: "sexual_content",
  harassment: "harassment",
  misinformation: "other",
  copyright: "copyright",
  other: "other",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) {
    return NextResponse.json({ error: "ID invalid" }, { status: 400 });
  }

  const userId = await getOptionalSocialUserId().catch(() => null);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon";
  const rlKey = userId ? `report:user:${userId}` : `report:ip:${ip}`;
  const rl = await rateLimit(rlKey, 5, 3600);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Prea multe raportări. Încearcă mai târziu." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalid" }, { status: 400 });
  }

  const rawCategory = String(body?.category || "").toLowerCase();
  const reason = UI_TO_REASON[rawCategory] || rawCategory;
  if (!ALLOWED.has(reason)) {
    return NextResponse.json({ error: "Categorie invalidă" }, { status: 400 });
  }
  const details = typeof body?.details === "string" ? body.details.slice(0, 1000) : null;

  try {
    const v = await dbQuery(`SELECT id FROM videos WHERE id = $1 LIMIT 1`, [videoId]);
    if (v.rows.length === 0) {
      return NextResponse.json({ error: "Video inexistent" }, { status: 404 });
    }

    await dbQuery(
      `INSERT INTO moderation_reports (reporter_user_id, target_video_id, reason, note, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, videoId, reason, details, JSON.stringify({ ui_category: rawCategory, ip })]
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message, videoId }, "video_report_failed");
    return NextResponse.json({ error: "Eroare server" }, { status: 500 });
  }
}
