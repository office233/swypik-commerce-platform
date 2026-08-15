import { dbQuery, withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Răspuns standard pentru cazul în care jobul a fost sărit (o altă rulare îl
 * ține). 200, nu 4xx/5xx: nu e o eroare, iar declanșatorul de cron
 * (`infra/hetzner/cron-worker/run.sh`) tratează codurile non-2xx ca alerte.
 */
export function cronSkippedResponse(job: string): Response {
  return Response.json({ success: true, skipped: true, job, reason: "locked" });
}

/**
 * Rulează un job de cron cu:
 *  - mutex distribuit (`pg_try_advisory_xact_lock`) → două declanșări
 *    suprapuse ale aceluiași job nu se calcă (P1-04). Lock-ul e legat de
 *    tranzacția-santinelă și se eliberează garantat la COMMIT/ROLLBACK, deci
 *    nu rămâne blocat dacă procesul moare;
 *  - audit-trail în `cron_runs`.
 *
 * Tranzacția-santinelă NU conține scrierile jobului (acelea merg pe alte
 * conexiuni din pool, prin `dbQuery`) — rolul ei e strict de a ține lock-ul.
 * Din același motiv insert-urile în `cron_runs` folosesc `dbQuery`.
 *
 * Returnează `null` când jobul a fost sărit pentru că o altă instanță rula
 * deja. Apelanții TREBUIE să trateze acest caz.
 */
export async function runCron<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const start = Date.now();

  return withTransaction(async (q) => {
    const { rows } = await q<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired",
      [`cron:${name}`],
    );
    if (!rows[0]?.acquired) {
      logger.warn({ job: name }, "[cron] skipped — another run holds the lock");
      await dbQuery(
        "INSERT INTO cron_runs(job_name, status, duration_ms, result, completed_at) VALUES($1,$2,$3,$4,NOW())",
        [name, "skipped", Date.now() - start, JSON.stringify({ reason: "locked" })],
      ).catch((err) => logger.warn({ err, job: name }, "[cron] audit-trail insert (skipped) failed"));
      return null;
    }

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
  });
}
