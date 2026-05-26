/**
 * POST /api/creator/videos/[id]/transcribe
 *
 * Folosește Gemini multimodal direct pe URL-ul video-ului (Files API → fetch + uploadFile)
 * sau, dacă SDK-ul nu poate accesa media, prompt-based: extrage transcript text approximate
 * din metadata existentă. Salvează rezultatul în videos.metadata.transcript.
 *
 * Notă: pentru video URL-uri externe, foloseam fileManager.uploadFile (din @google/generative-ai/server).
 * Aici păstrăm path-ul simplu: descărcăm primii bytes / folosim direct un text-only fallback.
 */

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { dbQuery } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";
import { rateLimit } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

async function transcribeFromUrl(videoUrl: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 800 },
    });

    // Fetch primii ~6MB ai videoclipului (sample suficient pentru audio short-form).
    const head = await fetch(videoUrl, { headers: { Range: "bytes=0-6000000" } });
    if (!head.ok) return null;
    const buf = Buffer.from(await head.arrayBuffer());
    const inlineData = {
      data: buf.toString("base64"),
      mimeType: head.headers.get("content-type") || "video/mp4",
    };

    const prompt = `Transcrie audio-ul acestui clip. Răspunde DOAR JSON: {"transcript": "..."}.
Reguli:
- Limba originală a clipului.
- Fără timestamps, fără speaker tags.
- Max 1500 caractere.`;

    const res = await model.generateContent([{ inlineData }, { text: prompt }]);
    const text = res.response?.text?.() || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return typeof parsed?.transcript === "string" ? parsed.transcript.slice(0, 4000) : null;
  } catch (e) {
    console.error("[transcribe] gemini error:", (e as Error).message);
    return null;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await rateLimit("videoTranscribe", creatorId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const videoId = id;
    const { rows } = await dbQuery<{
      id: string;
      playback_url: string | null;
      metadata: any;
    }>(
      `SELECT v.id, v.playback_url, v.metadata
       FROM videos v
       WHERE v.id = $1 AND v.creator_id = $2
       LIMIT 1`,
      [videoId, creatorId]
    );
    const video = rows[0];
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    // Sursa: playback_url HLS dacă disponibil, altfel source asset URL.
    let mediaUrl = video.playback_url || null;
    if (!mediaUrl) {
      const { rows: assets } = await dbQuery<{ public_url: string | null }>(
        `SELECT public_url FROM video_assets
         WHERE video_id = $1 AND asset_type = 'source'
         ORDER BY created_at DESC LIMIT 1`,
        [videoId]
      );
      mediaUrl = assets[0]?.public_url || null;
    }
    if (!mediaUrl) {
      return NextResponse.json({ error: "Video media not ready yet" }, { status: 409 });
    }

    const transcript = await transcribeFromUrl(mediaUrl);
    if (!transcript) {
      return NextResponse.json({ error: "Transcribe failed" }, { status: 502 });
    }

    await dbQuery(
      `UPDATE videos
       SET metadata = metadata || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND creator_id = $3`,
      [videoId, JSON.stringify({ transcript, transcribed_at: new Date().toISOString() }), creatorId]
    );

    return NextResponse.json({ video_id: videoId, transcript });
  } catch (err: any) {
    logger.error({ err: err }, "[transcribe] error:");
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
