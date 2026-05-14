import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import {
  generateBundle,
  generateCaption,
  generateHooks,
  generateTags,
  suggestCollection,
  type GeminiBundle,
  type SuggestionLanguage,
} from "@/lib/ai/gemini";
import { rateLimit } from "@/lib/security/rate-limit";
import { dropCachedSuggestions, setCachedSuggestions } from "@/lib/creator/upload-suggestions-cache";
import { getCreatorUserId } from "@/lib/creator/session";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

type Focus = "hooks" | "caption" | "tags" | "all";

type Body = {
  video_id: string;
  focus?: Focus;
  hook_choice?: string;
  language?: SuggestionLanguage;
};

export async function POST(req: Request) {
  try {
    const creatorId = await getCreatorUserId();
    if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await rateLimit("upload-suggest", creatorId, { limit: 20, window: 60 });
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }

    const body: Body = await req.json().catch(() => ({} as Body));
    if (!body.video_id) {
      return NextResponse.json({ error: "Missing video_id" }, { status: 400 });
    }

    // Force skip cache.
    await dropCachedSuggestions(body.video_id);

    const { rows } = await dbQuery<{
      id: string;
      title: string | null;
      description: string | null;
      metadata: any;
      ai_suggestions: any;
    }>(
      `SELECT id, title, description, metadata, ai_suggestions
       FROM videos WHERE id = $1 AND creator_id = $2 LIMIT 1`,
      [body.video_id, creatorId]
    );
    const video = rows[0];
    if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

    const transcript =
      (video.metadata && typeof video.metadata === "object" && typeof (video.metadata as any).transcript === "string"
        ? (video.metadata as any).transcript
        : undefined) || undefined;
    const description = video.description || undefined;
    const title = video.title || undefined;
    const language = body.language || "ro";

    const focus: Focus = body.focus || "all";
    const previous: Partial<GeminiBundle> =
      video.ai_suggestions && typeof video.ai_suggestions === "object" ? video.ai_suggestions : {};

    let next: GeminiBundle;

    if (focus === "all") {
      next = await generateBundle({ transcript, description, title, language });
    } else {
      const partial: GeminiBundle = {
        hooks: Array.isArray(previous.hooks) ? (previous.hooks as string[]) : [],
        caption: typeof previous.caption === "string" ? previous.caption : "",
        tags: Array.isArray(previous.tags) ? (previous.tags as string[]) : [],
        suggested_collection:
          typeof previous.suggested_collection === "string" ? previous.suggested_collection : "",
      };

      if (focus === "hooks") {
        partial.hooks = await generateHooks({ transcript, description, language });
      } else if (focus === "caption") {
        partial.caption = await generateCaption({
          transcript,
          description,
          hookChoice: body.hook_choice || partial.hooks[0] || "",
          language,
        });
      } else if (focus === "tags") {
        partial.tags = await generateTags({ transcript, title, description, language });
        partial.suggested_collection = await suggestCollection({ tags: partial.tags, language });
      }
      next = partial;
    }

    await setCachedSuggestions(body.video_id, next);
    await dbQuery(
      `UPDATE videos
       SET ai_suggestions = $2::jsonb, updated_at = NOW()
       WHERE id = $1 AND creator_id = $3`,
      [body.video_id, JSON.stringify({ ...next, generated_at: new Date().toISOString() }), creatorId]
    ).catch(() => undefined);

    return NextResponse.json({ ...next, cached: false, focus });
  } catch (err: any) {
    logger.error({ err: err }, "[upload-suggestions/regenerate] error:");
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
