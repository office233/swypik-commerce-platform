/**
 * POST /api/admin/cron/[jobName]/trigger
 *
 * Admin-only endpoint care declanșează manual un cron job, injectând
 * CRON_SECRET pe partea de server. Loghează rularea în cron_runs.
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED: Record<string, "GET" | "POST"> = {
  "abandoned-cart": "POST",
  "process-payouts": "POST",
  "reconcile-wallets": "POST",
  "suspend-unverified": "GET",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobName: string }> },
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobName } = await params;
  const method = ALLOWED[jobName];
  if (!method) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  // Folosim loopback intern în container (evită SSL/DNS la self-fetch prin proxy).
  // Fallback la origin-ul cererii dacă PORT nu e definit (dev local).
  const internalPort = process.env.PORT || "3000";
  const target = `http://127.0.0.1:${internalPort}/api/cron/${jobName}`;

  let runId: string | null = null;
  try {
    const { rows } = await dbQuery<{ id: string }>(
      "INSERT INTO cron_runs (job_name, status) VALUES ($1, 'running') RETURNING id",
      [jobName],
    );
    runId = rows[0]?.id ?? null;
  } catch {
    /* table may be missing */
  }

  const start = Date.now();
  let resultJson: unknown = null;
  let httpStatus = 0;
  let errMsg: string | null = null;

  try {
    const res = await fetch(target, {
      method,
      headers: { Authorization: "Bearer " + secret },
      cache: "no-store",
    });
    httpStatus = res.status;
    try {
      resultJson = await res.json();
    } catch {
      resultJson = { http_status: res.status };
    }
    if (!res.ok) {
      errMsg = "HTTP " + res.status;
    }
  } catch (err) {
    errMsg = (err as Error).message;
  }

  const duration = Date.now() - start;
  const finalStatus = errMsg ? "failed" : "success";

  if (runId) {
    try {
      await dbQuery(
        "UPDATE cron_runs SET completed_at = now(), status = $2, duration_ms = $3, result = $4, error = $5 WHERE id = $1",
        [runId, finalStatus, duration, JSON.stringify(resultJson), errMsg],
      );
    } catch {
      /* ignore */
    }
  }

  if (errMsg) {
    return NextResponse.json(
      { ok: false, error: errMsg, http_status: httpStatus, duration_ms: duration },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    duration_ms: duration,
    http_status: httpStatus,
    result: resultJson,
  });
}
