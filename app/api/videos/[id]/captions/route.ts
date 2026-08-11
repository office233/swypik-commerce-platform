import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { transcribe, type CaptionSegment } from "@/lib/ai/transcribe";
import { translateSegments, segmentsToText, type TargetLang } from "@/lib/ai/translate";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SUPPORTED: TargetLang[] = ["en", "es", "fr", "de", "pt", "it", "ro"];

type CapRow = { lang: string; text: string; segments: CaptionSegment[] | null; is_auto: boolean };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const lang = (url.searchParams.get("lang") || "").toLowerCase();
  if (!lang) return NextResponse.json({ error: "lang required" }, { status: 400 });
  const { rows } = await dbQuery<CapRow>(
    `SELECT lang, text, segments, is_auto FROM video_captions WHERE video_id=$1 AND lang=$2 LIMIT 1`,
    [id, lang],
  );
  if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(rows[0], { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("videoCaptions", session.userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const vid = id;
  const { rows: vrows } = await dbQuery<{ creator_id: string; playback_url: string | null }>(
    `SELECT creator_id, playback_url FROM videos WHERE id=$1 LIMIT 1`,
    [vid],
  );
  const video = vrows[0];
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  const isOwner = video.creator_id === session.userId;
  const isAdmin = session.role === "admin";
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sourceLang = typeof body.lang === "string" ? body.lang : undefined;
  const audioUrl = typeof body.audio_url === "string" ? body.audio_url : video.playback_url;
  if (!audioUrl) return NextResponse.json({ error: "no audio source" }, { status: 400 });

  // Secure against SSRF: only allow our trusted media bucket domains
  try {
    const parsedUrl = new URL(audioUrl);
    // 2026-08-11 (audit): host media derivat din S3_PUBLIC_URL (env).
    let mediaHost = "media.swypik.com";
    try {
      mediaHost = new URL(process.env.S3_PUBLIC_URL || "https://media.swypik.com").hostname;
    } catch { /* fallback prod */ }
    const allowedHosts = [
      mediaHost,
      "media.swypik.com",
      "swypik.com"
    ];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      return NextResponse.json({ error: "Forbidden domain" }, { status: 400 });
    }
  } catch (e) {
    if (!audioUrl.startsWith("/")) {
      return NextResponse.json({ error: "Invalid audio URL" }, { status: 400 });
    }
  }

  let buf: Buffer;
  try {
    const r = await fetch(audioUrl);
    if (!r.ok) return NextResponse.json({ error: `fetch audio ${r.status}` }, { status: 502 });

    const contentLength = r.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file too large (max 15MB)" }, { status: 400 });
    }

    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ error: `fetch failed: ${(e as Error).message}` }, { status: 502 });
  }

  const stt = await transcribe(buf, sourceLang);
  if (!stt.text || stt.segments.length === 0) {
    return NextResponse.json({ ok: false, reason: "transcription empty (likely Whisper disabled)" }, { status: 202 });
  }

  // UPSERT original
  const originalLang = (sourceLang || "ro").toLowerCase();
  await dbQuery(
    `INSERT INTO video_captions(video_id, lang, text, segments, is_auto)
       VALUES ($1,$2,$3,$4,true)
     ON CONFLICT (video_id, lang) DO UPDATE SET text=EXCLUDED.text, segments=EXCLUDED.segments, is_auto=true`,
    [vid, originalLang, stt.text, JSON.stringify(stt.segments)],
  );

  const targets = SUPPORTED.filter((l) => l !== originalLang);
  const results: Array<{ lang: string; ok: boolean }> = [{ lang: originalLang, ok: true }];
  for (const tgt of targets) {
    try {
      const translated = await translateSegments(stt.segments, tgt);
      const txt = segmentsToText(translated);
      await dbQuery(
        `INSERT INTO video_captions(video_id, lang, text, segments, is_auto)
           VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (video_id, lang) DO UPDATE SET text=EXCLUDED.text, segments=EXCLUDED.segments, is_auto=true`,
        [vid, tgt, txt, JSON.stringify(translated)],
      );
      results.push({ lang: tgt, ok: true });
    } catch (e) {
      console.warn(`[captions] ${tgt} failed:`, (e as Error).message);
      results.push({ lang: tgt, ok: false });
    }
  }
  return NextResponse.json({ ok: true, results });
}
