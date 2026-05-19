/**
 * POST /api/cron/strikes-decay
 *
 * Fades old strikes (status='expired' when past expires_at) and rebuilds
 * `user_risk_scores`. Also auto-lifts suspensions where suspended_until
 * has passed. Runs once per day via cron-worker.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  try {
    const { rows } = await dbQuery<{ expired: number; recomputed: number }>(
      "SELECT * FROM decay_user_strikes()",
    );
    const expired = Number(rows[0]?.expired ?? 0);
    const recomputed = Number(rows[0]?.recomputed ?? 0);

    const { rows: lifted } = await dbQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM users
        WHERE status = 'active'
          AND suspended_until IS NULL
          AND updated_at > now() - INTERVAL '1 minute'
          AND id IN (
            SELECT user_id FROM user_risk_scores WHERE score > 0
          )`,
    );

    await dbQuery(
      `INSERT INTO cron_runs (job, ok, elapsed_ms, meta)
       VALUES ($1, true, $2, $3::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        "strikes-decay",
        Date.now() - start,
        JSON.stringify({ expired, recomputed, suspensions_lifted: Number(lifted[0]?.n ?? 0) }),
      ],
    ).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - start,
      expired,
      recomputed,
    });
  } catch (err) {
    logger.error({ err }, "[cron/strikes-decay] failed");
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
