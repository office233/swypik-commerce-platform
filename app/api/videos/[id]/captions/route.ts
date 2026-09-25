/**
 * GET /api/videos/[id]/captions?lang=ro[&format=vtt]
 *
 * Subtitrarea publică a unui clip vizibil (JSON sau WebVTT pentru <track>).
 * Generarea/editarea s-au mutat în /api/creator/videos/[id]/captions (autentificat).
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import type { CaptionSegment } from "@/lib/ai/transcribe";
import { segmentsToVtt } from "@/lib/video/captions";
import { isUuid } from "@/lib/video/upload-session";

export const dynamic = "force-dynamic";

type CapRow = { lang: string; text: string; segments: CaptionSegment[] | null; is_auto: boolean };

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const lang = (url.searchParams.get("lang") || "").toLowerCase();
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  if (!/^[a-z]{2}$/.test(lang)) return NextResponse.json({ error: "lang_required" }, { status: 400 });

  const { rows } = await dbQuery<CapRow>(
    `SELECT c.lang, c.text, c.segments, c.is_auto
       FROM video_captions c
       JOIN videos v ON v.id = c.video_id
      WHERE c.video_id = $1 AND c.lang = $2
        AND v.status = 'ready' AND v.visibility IN ('public', 'unlisted')
        AND v.is_hidden = false AND v.effective_label = 'safe'
      LIMIT 1`,
    [id, lang],
  );
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (url.searchParams.get("format") === "vtt") {
    return new NextResponse(segmentsToVtt(row.segments ?? []), {
      headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": CACHE },
    });
  }
  return NextResponse.json(row, { headers: { "Cache-Control": CACHE } });
}
