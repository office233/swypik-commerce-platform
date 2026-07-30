import { withErrorHandling } from "@/lib/api-handler";
/**
 * POST /api/creator/videos/[id]/transcribe
 *
 * Transcriere audio din video — temporar dezactivată.
 * Provider-ul anterior (Gemini multimodal) a fost eliminat. Implementare nouă
 * (Whisper / alt provider audio) va veni separat. Endpoint răspunde 503.
 */

import { NextResponse } from "next/server";
import { getCreatorUserId } from "@/lib/creator/session";

export const dynamic = "force-dynamic";

async function POST_impl(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creatorId = await getCreatorUserId();
  if (!creatorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    {
      error: "transcribe_unavailable",
      message: "Transcrierea automată este temporar indisponibilă.",
      video_id: id,
    },
    { status: 503 },
  );
}

export const POST = withErrorHandling(POST_impl);
