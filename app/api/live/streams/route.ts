import { withErrorHandling } from "@/lib/api-handler";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function buildUrls(streamKey: string) {
  const isProd = process.env.NODE_ENV === "production";
  const host = process.env.LIVE_RTMP_HOST || (isProd ? "" : "swypik.com");
  const publicHost = process.env.LIVE_HLS_HOST || (isProd ? "" : "swypik.com");
  if (!host || !publicHost) {
    console.error("[live/streams] LIVE_RTMP_HOST/LIVE_HLS_HOST lipsesc în producție — URL-urile de stream vor fi invalide");
  }
  return {
    rtmp_url: `rtmp://${host}:1935/live/${streamKey}`,
    hls_url: `https://${publicHost}/hls/live/${streamKey}/index.m3u8`,
  };
}

async function POST_impl(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "creator" && session.role !== "admin" && session.role !== "seller") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rl = await rateLimit("liveStreams", session.userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
  const description = body.description ? String(body.description) : null;
  const scheduled_at = body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null;

  const streamKey = crypto.randomBytes(16).toString("hex");
  const urls = buildUrls(streamKey);

  const { rows } = await dbQuery<{ id: string }>(
    `INSERT INTO live_streams (creator_id, title, description, stream_key, rtmp_url, hls_url, scheduled_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [session.userId, title, description, streamKey, urls.rtmp_url, urls.hls_url, scheduled_at, scheduled_at ? "scheduled" : "live"],
  );

  return NextResponse.json({
    id: rows[0].id,
    stream_key: streamKey,
    rtmp_url: urls.rtmp_url,
    hls_url: urls.hls_url,
    status: scheduled_at ? "scheduled" : "live",
  });
}

async function GET_impl(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "live";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 50);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

  const { rows } = await dbQuery(
    `SELECT ls.id, ls.creator_id, ls.title, ls.description, ls.status, ls.viewer_count,
            ls.peak_viewers, ls.scheduled_at, ls.started_at, ls.ended_at, ls.hls_url,
            u.username, u.display_name, u.avatar_url
       FROM live_streams ls
       LEFT JOIN users u ON u.id::text = ls.creator_id
      WHERE ls.status = $1
      ORDER BY ls.started_at DESC NULLS LAST, ls.created_at DESC
      LIMIT $2 OFFSET $3`,
    [status, limit, offset],
  );

  return NextResponse.json({ items: rows });
}

export const POST = withErrorHandling(POST_impl);
export const GET = withErrorHandling(GET_impl);
