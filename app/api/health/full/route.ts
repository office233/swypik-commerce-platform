import { NextResponse } from "next/server";
import { checkDb, checkRedis, checkR2, checkQueue } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health/full
 *
 * Aggregated health: DB write + DB read (split-pool ready) + Redis + R2 + BullMQ queue.
 * Returns 200 if all OK, 503 if any error. Each subcheck reports latency_ms.
 */
export async function GET() {
  const startedAt = Date.now();

  const [dbWrite, dbRead, redis, r2, queue] = await Promise.all([
    checkDb(),
    // Currently the read pool == write pool; when REPLICA_DATABASE_URL is wired
    // into lib/db.ts (see docs/scale-prep.md), this will exercise the replica.
    checkDb(),
    checkRedis(),
    checkR2(),
    checkQueue(),
  ]);

  const overall =
    [dbWrite, dbRead, redis, r2, queue].some((r) => r.status === "error")
      ? "error"
      : [dbWrite, dbRead, redis, r2, queue].some((r) => r.status === "degraded")
        ? "degraded"
        : "ok";

  const body = {
    status: overall,
    timestamp: new Date().toISOString(),
    total_latency_ms: Date.now() - startedAt,
    db_write: dbWrite,
    db_read: dbRead,
    redis,
    r2,
    queue,
  };

  return NextResponse.json(body, { status: overall === "error" ? 503 : 200 });
}
