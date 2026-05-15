import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows: own } = await dbQuery<{ creator_id: string }>(
    `SELECT creator_id FROM live_streams WHERE id = $1`,
    [id],
  );
  if (!own[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (own[0].creator_id !== session.userId && session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const options = Array.isArray(body.options) ? body.options.map((o: any) => String(o)) : [];
  if (!question || options.length < 2) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO live_polls (stream_id, question, options) VALUES ($1,$2,$3::jsonb) RETURNING id`,
    [id, question, JSON.stringify(options.map((label: string) => ({ label, votes: 0 })))],
  );
  return NextResponse.json({ id: rows[0].id });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await dbQuery(
    `SELECT id, question, options, created_at, closed_at
       FROM live_polls WHERE stream_id = $1 ORDER BY created_at DESC`,
    [id],
  );
  return NextResponse.json({ items: rows });
}
