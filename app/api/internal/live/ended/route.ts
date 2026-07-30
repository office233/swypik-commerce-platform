import { withErrorHandling } from "@/lib/api-handler";
import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function verifyInternal(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) return false;
  return req.headers.get("x-internal") === secret;
}

function extractKey(path: string): string | null {
  const m = path.match(/^live\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

async function POST_impl(req: NextRequest) {
  if (!verifyInternal(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const json = form ? null : await req.json().catch(() => ({}));
  const path = String(form?.get("path") ?? (json as any)?.path ?? "");
  const streamKey = extractKey(path);
  if (!streamKey) return NextResponse.json({ error: "invalid_path" }, { status: 400 });

  await dbQuery(
    `UPDATE live_streams SET status = 'ended', ended_at = now()
       WHERE stream_key = $1 AND status = 'live'`,
    [streamKey],
  );
  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling(POST_impl);
