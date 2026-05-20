import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dbQuery } from "@/lib/db";
import { runCron } from "@/lib/cron/runCron";
import { checkQueue } from "@/lib/health";
import { sendEmail } from "@/lib/email/service";

export const dynamic = "force-dynamic";

const STALE_PROCESSING_MIN = Number(process.env.VIDEO_ALERT_STALE_MIN ?? 30);
const STALE_PROCESSING_THRESHOLD = Number(process.env.VIDEO_ALERT_STALE_THRESHOLD ?? 25);
const QUEUE_LENGTH_THRESHOLD = Number(process.env.VIDEO_ALERT_QUEUE_LEN ?? 15_000);
const QUEUE_PENDING_THRESHOLD = Number(process.env.VIDEO_ALERT_QUEUE_PENDING ?? 200);
const QUEUE_LAG_THRESHOLD = Number(process.env.VIDEO_ALERT_QUEUE_LAG ?? 5_000);
const QUEUE_FAILED_THRESHOLD = Number(process.env.VIDEO_ALERT_QUEUE_FAILED ?? 50);
const COOLDOWN_MIN = Number(process.env.VIDEO_ALERT_COOLDOWN_MIN ?? 60);
const ALERT_TO = process.env.VIDEO_ALERT_EMAIL || process.env.ADMIN_ALERT_EMAIL || "";

function authorize(req: Request): boolean {
  const header =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !header) return false;
  if (Buffer.byteLength(header) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

interface StaleProcessing {
  count: number;
  oldest_minutes: number | null;
}

async function staleProcessing(): Promise<StaleProcessing> {
  const r = await dbQuery<{ n: string; oldest_minutes: string | null }>(
    `SELECT COUNT(*)::text AS n,
            EXTRACT(EPOCH FROM (now() - MIN(updated_at)))::int / 60 AS oldest_minutes
       FROM videos
      WHERE status IN ('processing','uploading','queued','pending')
        AND updated_at < now() - ($1::int * INTERVAL '1 minute')`,
    [STALE_PROCESSING_MIN]
  );
  const row = r.rows[0] || { n: "0", oldest_minutes: null };
  return {
    count: Number(row.n || 0),
    oldest_minutes: row.oldest_minutes != null ? Number(row.oldest_minutes) : null,
  };
}

async function loadCooldown(key: string): Promise<Date | null> {
  const r = await dbQuery<{ alerted_at: Date }>(
    `SELECT alerted_at FROM ops_alert_log WHERE alert_key = $1 ORDER BY alerted_at DESC LIMIT 1`,
    [key]
  );
  return r.rows[0]?.alerted_at ?? null;
}

async function persistAlert(key: string, payload: unknown) {
  await dbQuery(
    `INSERT INTO ops_alert_log (alert_key, payload, alerted_at) VALUES ($1, $2, now())`,
    [key, JSON.stringify(payload)]
  );
}

interface Breach {
  metric: string;
  value: number | string;
  threshold: number | string;
}

function evaluateBreaches(stale: StaleProcessing, queue: Awaited<ReturnType<typeof checkQueue>>): Breach[] {
  const breaches: Breach[] = [];
  if (stale.count >= STALE_PROCESSING_THRESHOLD) {
    breaches.push({ metric: `videos.processing > ${STALE_PROCESSING_MIN}min`, value: stale.count, threshold: STALE_PROCESSING_THRESHOLD });
  }
  const d = (queue.detail || {}) as Record<string, number>;
  if ((d.length ?? 0) >= QUEUE_LENGTH_THRESHOLD) {
    breaches.push({ metric: "redis stream length", value: d.length, threshold: QUEUE_LENGTH_THRESHOLD });
  }
  if ((d.pending ?? 0) >= QUEUE_PENDING_THRESHOLD) {
    breaches.push({ metric: "consumer pending", value: d.pending, threshold: QUEUE_PENDING_THRESHOLD });
  }
  if ((d.lag ?? 0) >= QUEUE_LAG_THRESHOLD) {
    breaches.push({ metric: "consumer lag", value: d.lag, threshold: QUEUE_LAG_THRESHOLD });
  }
  if ((d.failed ?? 0) >= QUEUE_FAILED_THRESHOLD) {
    breaches.push({ metric: "failed stream length", value: d.failed, threshold: QUEUE_FAILED_THRESHOLD });
  }
  return breaches;
}

function renderHtml(breaches: Breach[], stale: StaleProcessing, queue: Awaited<ReturnType<typeof checkQueue>>): string {
  const rows = breaches
    .map((b) => `<tr><td>${b.metric}</td><td><strong>${b.value}</strong></td><td>&ge; ${b.threshold}</td></tr>`)
    .join("");
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif">
<h2 style="color:#b91c1c">[Swypik] Video queue alert</h2>
<p>One or more video pipeline metrics exceeded thresholds.</p>
<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">
<thead><tr style="background:#f3f4f6"><th>Metric</th><th>Value</th><th>Threshold</th></tr></thead>
<tbody>${rows}</tbody></table>
<h3>Snapshot</h3>
<pre style="background:#f9fafb;padding:10px;border-radius:4px">${JSON.stringify({ stale, queue }, null, 2)}</pre>
<p>Cooldown: ${COOLDOWN_MIN} min. Source: <code>/api/cron/alert-video-queue</code></p>
</body></html>`;
}

async function run() {
  const [stale, queue] = await Promise.all([staleProcessing(), checkQueue()]);
  const breaches = evaluateBreaches(stale, queue);
  const out: Record<string, unknown> = {
    ts: new Date().toISOString(),
    stale,
    queue,
    breaches,
    alerted: false,
    skipped_reason: undefined,
  };

  if (breaches.length === 0) {
    return out;
  }

  const alertKey = "video_queue";
  const last = await loadCooldown(alertKey).catch(() => null);
  if (last && Date.now() - last.getTime() < COOLDOWN_MIN * 60_000) {
    out.skipped_reason = "cooldown";
    return out;
  }

  if (!ALERT_TO) {
    out.skipped_reason = "no_recipient";
    await persistAlert(alertKey, { ...out, suppressed: true }).catch(() => undefined);
    return out;
  }

  const html = renderHtml(breaches, stale, queue);
  const subject = `[Swypik] Video queue: ${breaches.length} threshold breach(es)`;
  const ok = await sendEmail({ to: ALERT_TO, subject, html, marketing: false });
  out.alerted = ok;
  await persistAlert(alertKey, out).catch(() => undefined);
  return out;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCron("alert-video-queue", async () => {
    const summary = await run();
    return NextResponse.json(summary);
  });
}

export async function POST(req: Request) {
  return GET(req);
}
