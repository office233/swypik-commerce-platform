import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

import { requireAuth } from "@/lib/auth/getAuthUser";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    const { rows } = await dbQuery(`
      SELECT * FROM daily_challenges
      ORDER BY created_at DESC
    `);
    return NextResponse.json({ challenges: rows });
  } catch (error) {
    logger.error({ err: error }, "GET /api/admin/challenges Error:");
    return NextResponse.json({ error: "Failed to fetch challenges" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    const body = await req.json();
    const { title, description, challenge_type, topic, reward_points, max_entries, starts_at, ends_at, featured } = body;

    const { rows } = await dbQuery(`
      INSERT INTO daily_challenges 
      (title, description, challenge_type, topic, reward_points, max_entries, starts_at, ends_at, featured, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
      RETURNING *
    `, [title, description, challenge_type, topic, reward_points, max_entries, starts_at, ends_at, featured || false]);

    return NextResponse.json({ challenge: rows[0] });
  } catch (error) {
    logger.error({ err: error }, "POST /api/admin/challenges Error:");
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const __auth = await requireAuth(req, ["admin"]);
  if (__auth instanceof NextResponse) return __auth;

  try {
    const body = await req.json();
    const { id, status, featured } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const updates: string[] = [];
    const params: Array<string | number | boolean> = [id];
    let paramIndex = 2;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (featured !== undefined) {
      updates.push(`featured = $${paramIndex++}`);
      params.push(featured);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { rows } = await dbQuery(`
      UPDATE daily_challenges
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    return NextResponse.json({ challenge: rows[0] });
  } catch (error) {
    logger.error({ err: error }, "PATCH /api/admin/challenges Error:");
    return NextResponse.json({ error: "Failed to update challenge" }, { status: 500 });
  }
}
