/**
 * Cron Job: Publish scheduled videos.
 *
 * Selects videos where scheduled_publish_at <= now() and published_at is null.
 * Sets is_draft=false, scheduled_publish_at=null, published_at=now(),
 * visibility='public'.
 *
 * Auth: CRON_SECRET (Bearer / x-cron-secret header).
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

async function authorize(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    req.headers.get("CRON_SECRET") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

async function run(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rows } = await dbQuery<{ id: string }>(
    `UPDATE videos
        SET is_draft = false,
            scheduled_publish_at = NULL,
            published_at = COALESCE(published_at, now()),
            visibility = 'public',
            updated_at = now()
      WHERE scheduled_publish_at IS NOT NULL
        AND scheduled_publish_at <= now()
        AND status <> 'deleted'
      RETURNING id`,
  );

  return NextResponse.json({
    success: true,
    published: rows.length,
    ids: rows.map((r) => r.id),
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
