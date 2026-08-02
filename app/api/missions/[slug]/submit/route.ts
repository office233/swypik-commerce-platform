/**
 * POST /api/missions/[slug]/submit — creatorul înscrie un clip la o misiune.
 * Body: { videoId }
 * Reguli: misiune activă (starts_at <= now < ends_at), video publicat și
 * deținut de user, o singură înscriere per (mission, user, video).
 */
import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const userId = await getOptionalSocialUserId();
  if (!userId) {
    return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  }

  const rl = await rateLimit("mission-submit", clientIp(request), { limit: 10, window: 60 });
  if (!rl.success) {
    return NextResponse.json({ error: "Prea multe cereri." }, { status: 429 });
  }

  let body: { videoId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalid." }, { status: 400 });
  }
  const videoId = String(body.videoId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) {
    return NextResponse.json({ error: "videoId invalid." }, { status: 400 });
  }

  // misiune activă
  const { rows: missions } = await dbQuery<{ id: string }>(
    `SELECT id FROM creator_missions
      WHERE slug = $1 AND status = 'active'
        AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`,
    [slug],
  );
  if (!missions.length) {
    return NextResponse.json({ error: "Misiunea nu e activă." }, { status: 404 });
  }
  const missionId = missions[0].id;

  // video publicat, deținut de user
  const { rows: videos } = await dbQuery<{ id: string }>(
    `SELECT id FROM videos WHERE id = $1 AND creator_id = $2 AND status = 'published'`,
    [videoId, userId],
  );
  if (!videos.length) {
    return NextResponse.json(
      { error: "Clipul nu există, nu e publicat sau nu îți aparține." },
      { status: 403 },
    );
  }

  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO creator_mission_submissions (mission_id, user_id, video_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (mission_id, user_id, video_id) DO NOTHING
     RETURNING id`,
    [missionId, userId, videoId],
  );
  if (!rows.length) {
    return NextResponse.json({ error: "Ai înscris deja acest clip." }, { status: 409 });
  }

  logger.info({ missionId, userId, videoId }, "mission.submission.created");
  return NextResponse.json({ ok: true, submissionId: rows[0].id }, { status: 201 });
}

/** GET — submisiile userului curent la această misiune */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const userId = await getOptionalSocialUserId();
  if (!userId) return NextResponse.json({ submissions: [] });

  const { rows } = await dbQuery(
    `SELECT s.id, s.video_id, s.status, s.views, s.sales, s.payout_minor,
            s.payout_currency, s.paid_at, s.submitted_at
       FROM creator_mission_submissions s
       JOIN creator_missions m ON m.id = s.mission_id
      WHERE m.slug = $1 AND s.user_id = $2
      ORDER BY s.submitted_at DESC`,
    [slug, userId],
  );
  return NextResponse.json({ submissions: rows });
}
