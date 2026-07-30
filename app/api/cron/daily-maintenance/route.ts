/**
 * GET/POST /api/cron/daily-maintenance — mentenanță zilnică.
 * Protejat cu header x-cron-secret = env CRON_SECRET.
 *
 * Rulare (crontab, o dată pe zi la 04:15):
 *   15 4 * * * curl -s -o /dev/null -H "x-cron-secret: $CRON_SECRET" https://swypik.com/api/cron/daily-maintenance
 *
 * Sarcini:
 *  - retrogradarea Founding Drivers inactivi (sub 50 curse în fereastra de 90
 *    de zile) → early18, ceea ce eliberează automat sloturi founding15.
 */
import { NextResponse } from "next/server";
import { demoteInactiveFoundingDrivers } from "@/lib/drivers/tiers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = logger.child({ mod: "cron/daily-maintenance" });

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const demoted = await demoteInactiveFoundingDrivers();
    return NextResponse.json({ success: true, demoted });
  } catch (err) {
    log.error({ err }, "daily maintenance failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
