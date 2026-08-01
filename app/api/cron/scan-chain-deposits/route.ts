/**
 * GET|POST /api/cron/scan-chain-deposits
 *
 * Deposit watcher: scanează blocurile noi de pe Swypik Chain și creditează
 * ledgerul intern pentru transferurile user → trezorerie REWARDS.
 * Idempotent (unic pe tx_hash), cursor persistent pe ultimul bloc scanat.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET.
 * Frecvență recomandată: la 5 minute.
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { timingSafeEqual } from "node:crypto";
import { runCron } from "@/lib/cron/runCron";
import { scanChainDeposits } from "@/lib/swyp/deposits";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ cron: "scan-chain-deposits" });

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runCron("scan-chain-deposits", async () => {
    const r = await scanChainDeposits();
    log.info(
      { fromBlock: r.fromBlock.toString(), toBlock: r.toBlock.toString(), found: r.found, credited: r.credited },
      "chain deposit scan done",
    );
    return {
      fromBlock: r.fromBlock.toString(),
      toBlock: r.toBlock.toString(),
      found: r.found,
      credited: r.credited,
    };
  });
  return NextResponse.json({ success: true, ...result });
}

export const GET = withErrorHandling(async function GET(req: Request) {
  return handle(req);
});
export const POST = withErrorHandling(async function POST(req: Request) {
  return handle(req);
});
