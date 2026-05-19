/**
 * Notification poll endpoint.
 * GET  — recent 30, unread first.
 * POST — body: { ids?: string[]; markAll?: boolean } → mark read.
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { rows } = await dbQuery<{
      id: string;
      kind: string;
      title: string;
      body: string | null;
      ref_type: string | null;
      ref_id: string | null;
      cta_url: string | null;
      read_at: string | null;
      created_at: string;
    }>(
      `SELECT id::text, kind, title, body, ref_type, ref_id::text, cta_url, read_at, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY (read_at IS NOT NULL), created_at DESC
        LIMIT 30`,
      [user.userId],
    );

    const { rows: countRows } = await dbQuery<{ unread: string }>(
      `SELECT COUNT(*)::text AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [user.userId],
    );

    return NextResponse.json(
      {
        unread: Number(countRows[0]?.unread || 0),
        notifications: rows.map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body,
          refType: n.ref_type,
          refId: n.ref_id,
          ctaUrl: n.cta_url,
          readAt: n.read_at,
          createdAt: n.created_at,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { unread: 0, notifications: [], error: (err as Error).message },
      { status: 200 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; markAll?: boolean };

  try {
    if (body.markAll) {
      await dbQuery(
        `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
        [user.userId],
      );
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids = body.ids.filter((x) => typeof x === "string" && /^\d+$/.test(x)).map(Number);
      if (ids.length === 0) return NextResponse.json({ error: "invalid_ids" }, { status: 400 });
      await dbQuery(
        `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::bigint[]) AND read_at IS NULL`,
        [user.userId, ids],
      );
    } else {
      return NextResponse.json({ error: "nothing_to_do" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
