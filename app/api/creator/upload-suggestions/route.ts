import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { generateBundle, type GeminiBundle, type SuggestionLanguage } from "@/lib/ai/gemini";
import { getCachedSuggestions, setCachedSuggestions } from "@/lib/creator/upload-suggestions-cache";
import { getCreatorUserId } from "@/lib/creator/session";
import { rateLimit } from "@/lib/security/rate-limit";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

type SuggestionBody = {
  video_id?: string;
  transcript?: string;
  description?: string;
  title?: string;
  niche?: string;
  language?: SuggestionLanguage;
};

async function loadVideoContext(videoId: string, creatorId: string) {
  try {
    const { rows } = await dbQuery<{
      id: string;
      title: string | null;
      description: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, title, description, metadata
       FROM videos
       WHERE id = $1 AND creator_id = $2
       LIMIT 1`,
      [videoId, creatorId]
    );
    return rows[0] || null;
  } catch (e) {
    logger.warn({ err: e }, "[upload-suggestions] video lookup failed");
    return null;
  }
}

async function persistSuggestions(videoId: string, creatorId: string, bundle: GeminiBundle) {
  try {
    await dbQuery(
      `UPDATE videos
       SET ai_suggestions = $2::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND creator_id = $3`,
      [videoId, JSON.stringify({ ...bundle, generated_at: new Date().toISOString() }), creatorId]
    );
  } catch (e) {
    // Migration may not have been applied yet — fail soft.
    logger.warn({ err: e }, "[upload-suggestions] persist failed");
  }
}

export async function POST(req: Request) {
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 20/min per creator
    const rl = await rateLimit("upload-suggest", creatorId, { limit: 20, window: 60 });
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests. Încearcă din nou într-un minut." },
        { status: 429 }
      );
    }

    const body: SuggestionBody = await req.json().catch(() => ({}));
    const videoId = body.video_id || null;

    // Cache hit
    const cached = await getCachedSuggestions(videoId);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    // Enrich from DB if we have a video id
    let transcript = body.transcript;
    let description = body.description;
    let title = body.title;

    if (videoId) {
      const ctx = await loadVideoContext(videoId, creatorId);
      if (ctx) {
        title = title || ctx.title || undefined;
        description = description || ctx.description || undefined;
        if (!transcript && ctx.metadata && typeof ctx.metadata === "object") {
          const meta = ctx.metadata as Record<string, unknown>;
          if (typeof meta.transcript === "string") transcript = meta.transcript;
        }
      }
    }

    if (!transcript && !description && !title) {
      return NextResponse.json(
        { error: "Lipsește contextul: trimite transcript, description sau title." },
        { status: 400 }
      );
    }

    const bundle = await generateBundle({
      transcript,
      description,
      title,
      niche: body.niche,
      language: body.language || "ro",
    });

    if (videoId) {
      await setCachedSuggestions(videoId, bundle);
      await persistSuggestions(videoId, creatorId, bundle);
    }

    return NextResponse.json({ ...bundle, cached: false });
  } catch (err) {
    logger.error({ err }, "[upload-suggestions] POST error:");
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
