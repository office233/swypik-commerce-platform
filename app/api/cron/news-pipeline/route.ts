import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runNewsIngestionPipeline } from "@/lib/news/rss-ingester";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { isAdminRequest } from "@/lib/security/admin-auth";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Same timing-safe CRON_SECRET check as app/api/cron/refresh-rank/route.ts.
 * Kept local (rather than extracted to a shared helper) because this route
 * is the only one under YOUR FILES scope — refresh-rank's copy stays
 * untouched to avoid a cross-agent collision on a file another agent owns.
 */
function authorizeCronRequest(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET || "";
  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const providedSecret =
    bearerToken ||
    request.headers.get("x-cron-secret") ||
    request.headers.get("cron-secret") ||
    "";

  if (!expectedSecret || !providedSecret) return false;
  if (Buffer.byteLength(providedSecret) !== Buffer.byteLength(expectedSecret)) return false;
  return timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret));
}

/**
 * POST/GET /api/cron/news-pipeline
 *
 * Triggers the AI news ingestion pipeline (lib/news/rss-ingester.ts).
 * Auth: either
 *   - header `x-cron-secret` / `cron-secret` / `Authorization: Bearer <CRON_SECRET>`
 *     matching the CRON_SECRET env var (scheduled cron caller), OR
 *   - an authenticated ADMIN request (see lib/security/admin-auth.ts) for
 *     manual/on-demand triggers from the admin panel.
 * Every call — even ones from a legitimate cron/admin caller — is rate
 * limited, since each run can invoke the Gemini API up to NEWS_MAX_ARTICLES_PER_RUN
 * times (unbounded cost otherwise).
 */
async function handle(req: NextRequest) {
  if (!isEnabled("news")) return frozenResponse("news");

  const isCron = authorizeCronRequest(req);
  const isAdmin = isCron ? false : await isAdminRequest(req);

  if (!isCron && !isAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rlIdentifier = isCron ? "cron" : getClientIP(req);
  const rl = await rateLimit("newsPipeline", rlIdentifier);
  if (!rl.success) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    let targetCategory: string | undefined;

    const urlCat = new URL(req.url).searchParams.get("category");
    if (urlCat) {
      targetCategory = urlCat;
    } else {
      const body = await req.json().catch(() => ({}));
      if (body?.category) targetCategory = String(body.category).slice(0, 40);
    }

    const res = await runNewsIngestionPipeline(targetCategory);

    return NextResponse.json({
      ok: true,
      ingested: res.ingested,
      categories: res.categoriesProcessed,
      capped: res.capped,
      triggeredBy: isCron ? "cron" : "admin",
    });
  } catch (err: unknown) {
    logger.error({ err }, "[news-pipeline] run failed");
    return NextResponse.json({ ok: false, error: "pipeline_failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
