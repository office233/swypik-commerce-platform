import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { runCron } from "@/lib/cron/runCron";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

async function authorize(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    req.headers.get("x-cron-token") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runCron("watchdog-videos", async () => {
    const res = await dbQuery<{ id: string; status: string }>(
      `UPDATE videos
         SET status='failed', updated_at=NOW()
       WHERE status IN ('processing','uploading')
         AND updated_at < NOW() - INTERVAL '30 minutes'
       RETURNING id, status`
    );
    const recovered = res.rowCount ?? res.rows.length;
    return NextResponse.json({ recovered, ts: new Date().toISOString() });
  });
}

export async function POST(req: Request) {
  return GET(req);
}
