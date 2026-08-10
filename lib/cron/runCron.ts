import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function runCron<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await dbQuery(
      "INSERT INTO cron_runs(job_name, status, duration_ms, result, completed_at) VALUES($1,$2,$3,$4,NOW())",
      [name, "success", Date.now() - start, JSON.stringify(result ?? {})]
    ).catch((err) => logger.warn({ err, job: name }, "[cron] audit-trail insert (success) failed"));
    return result;
  } catch (e: any) {
    await dbQuery(
      "INSERT INTO cron_runs(job_name, status, duration_ms, error, completed_at) VALUES($1,$2,$3,$4,NOW())",
      [name, "failed", Date.now() - start, String(e?.message || e)]
    ).catch((err) => logger.warn({ err, job: name }, "[cron] audit-trail insert (failed) failed"));
    throw e;
  }
}
