import { dbQuery } from "@/lib/db";

export async function runCron<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await dbQuery(
      "INSERT INTO cron_runs(job_name, status, duration_ms, result, completed_at) VALUES($1,$2,$3,$4,NOW())",
      [name, "success", Date.now() - start, JSON.stringify(result ?? {})]
    ).catch(() => {});
    return result;
  } catch (e: any) {
    await dbQuery(
      "INSERT INTO cron_runs(job_name, status, duration_ms, error, completed_at) VALUES($1,$2,$3,$4,NOW())",
      [name, "failed", Date.now() - start, String(e?.message || e)]
    ).catch(() => {});
    throw e;
  }
}
