import { withErrorHandling } from "@/lib/api-handler";
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

async function GET_impl(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await dbQuery<{ lang: string }>(
    `SELECT lang FROM video_captions WHERE video_id=$1 ORDER BY lang`,
    [id],
  );
  return NextResponse.json(
    { languages: rows.map((r) => r.lang) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}

export const GET = withErrorHandling(GET_impl);
