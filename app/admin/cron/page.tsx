/**
 * Admin Cron Dashboard — listă job-uri + ultimul run + manual trigger.
 */
import { dbQuery } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { Clock } from "lucide-react";
import CronJobRow from "./CronJobRow";
import { CRON_JOBS } from "./jobs";

export const dynamic = "force-dynamic";

interface LastRun {
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: string | null;
  duration_ms: number | null;
  error: string | null;
}

async function getLastRuns(): Promise<Map<string, LastRun>> {
  try {
    const { rows } = await dbQuery<LastRun>(
      "SELECT DISTINCT ON (job_name) job_name, started_at, completed_at, status, duration_ms, error FROM cron_runs ORDER BY job_name, started_at DESC",
    );
    const map = new Map<string, LastRun>();
    for (const r of rows) map.set(r.job_name, r);
    return map;
  } catch {
    return new Map();
  }
}

export default async function AdminCronPage() {
    const t = await getTranslations("adminCron");
  const lastRuns = await getLastRuns();

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-2">
        <Clock className="w-6 h-6 text-[#0D0D0D]" />
        <div>
          <h1 className="text-2xl font-black text-[#0D0D0D]">Cron Jobs</h1>
          <p className="text-sm text-[#0D0D0D]/60 mt-0.5">
            Job-uri programate. Ultim run citit din <code>cron_runs</code>.
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#0D0D0D]/10 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-[#F7F7F8] text-[10px] uppercase tracking-wider text-[#0D0D0D]/60">
            <tr>
              <th className="text-left px-4 py-2 font-black">Job</th>
              <th className="text-left px-4 py-2 font-black">Schedule</th>
              <th className="text-left px-4 py-2 font-black">Ultim run</th>
              <th className="text-left px-4 py-2 font-black">Status</th>
              <th className="text-right px-4 py-2 font-black">{t("thActions")}</th>
            </tr>
          </thead>
          <tbody>
            {CRON_JOBS.map((job) => (
              <CronJobRow
                key={job.name}
                job={job}
                last={lastRuns.get(job.name) || null}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#0D0D0D]/50 mt-4">
        Tabela <code>cron_runs</code> e populată când rulezi un job manual de
        aici. Dacă „Ultim run” e gol, înseamnă că job-ul a rulat doar din
        cron-worker (nu loghează încă în DB).
      </p>
    </div>
  );
}
