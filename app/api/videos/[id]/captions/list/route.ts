import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { invalidIdResponse, isUuidParam } from "@/lib/validation/params";
import { applyCachePolicy } from "@/lib/http/cache-policy";

export const dynamic = "force-dynamic";

async function GET_impl(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuidParam(id)) return invalidIdResponse();
  const { rows } = await dbQuery<{ lang: string }>(
    `SELECT lang FROM video_captions WHERE video_id=$1 ORDER BY lang`,
    [id],
  );
  return applyCachePolicy(
    NextResponse.json({ languages: rows.map((r) => r.lang) }),
    "videos/[id]/captions/list",
    req,
  );
}

export const GET = withErrorHandling(GET_impl);
