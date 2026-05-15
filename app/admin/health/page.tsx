/**
 * Admin Health Dashboard — live status DB, Redis, R2, Queue.
 */
import { checkDb, checkQueue, checkR2, checkRedis, type HealthResult } from "@/lib/health";
import HealthRefresh from "./HealthRefresh";

export const dynamic = "force-dynamic";

type CardKey = "db" | "redis" | "r2" | "queue";

const META: Record<CardKey, { title: string; desc: string }> = {
  db: { title: "Database", desc: "PostgreSQL — pool conexiuni" },
  redis: { title: "Redis", desc: "Cache + sesiuni + streams" },
  r2: { title: "R2 Storage", desc: "Bucket media (Cloudflare R2)" },
  queue: { title: "Queue video", desc: "Stream-uri Redis (jobs + failed)" },
};

export default async function AdminHealthPage() {
  const [db, redis, r2, queue] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkR2(),
    checkQueue(),
  ]);

  const initial: Record<CardKey, HealthResult> = { db, redis, r2, queue };
  const checkedAt = new Date().toISOString();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#0D0D0D]">Health</h1>
        <p className="text-sm text-[#0D0D0D]/60 mt-1">
          Status live al infrastructurii. Refresh automat la 10s.
        </p>
      </div>
      <HealthRefresh initial={initial} checkedAt={checkedAt} meta={META} />
    </div>
  );
}
