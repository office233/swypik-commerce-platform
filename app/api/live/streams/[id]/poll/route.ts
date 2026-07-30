import { withErrorHandling } from "@/lib/api-handler";
import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/validation/uuid";
import { rateLimit } from "@/lib/security/rate-limit";
import { LivePollCreateSchema, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

async function POST_impl(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rl = await rateLimit("livePoll", session.userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { rows: own } = await dbQuery<{ creator_id: string }>(
    `SELECT creator_id FROM live_streams WHERE id = $1`,
    [id],
  );
  if (!own[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (own[0].creator_id !== session.userId && session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const rawBody = await req.json().catch(() => null);
  const parsedBody = parseBody(LivePollCreateSchema, rawBody);
  if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
  const { question, options } = parsedBody.data;
  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO live_polls (stream_id, question, options) VALUES ($1,$2,$3::jsonb) RETURNING id`,
    [id, question, JSON.stringify(options.map((label: string) => ({ label, votes: 0 })))],
  );
  return NextResponse.json({ id: rows[0].id });
}

async function GET_impl(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const { rows } = await dbQuery(
    `SELECT id, question, options, created_at, closed_at
       FROM live_polls WHERE stream_id = $1 ORDER BY created_at DESC`,
    [id],
  );
  return NextResponse.json({ items: rows });
}

export const POST = withErrorHandling(POST_impl);
export const GET = withErrorHandling(GET_impl);
