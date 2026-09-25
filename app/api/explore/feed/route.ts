import { NextRequest, NextResponse } from "next/server";
import { getOptionalSocialUserId } from "@/lib/social/session";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { FEED_SESSION_COOKIE, resolveOrIssueFeedSession, setFeedSessionCookie } from "@/lib/feed/feed-session";
import { parseFeedRequest } from "@/lib/feed/request";
import { serveFeed } from "@/lib/feed/serve";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/explore/feed — feed-ul unificat (Home + /explore).
 *
 * Răspuns: { items: FeedItem[], videos, nextCursor, hasMore, requestId, ab }
 * (contract în lib/feed/types.ts; logica în lib/feed/serve.ts). Paginare pe
 * cursor opac (`cursor=`), fără OFFSET. Vizitatorii fără cont primesc o
 * sesiune de feed semnată (`feed_sid`) — singura acceptată de ingest-ul de
 * evenimente și cheia seen-set-ului lor.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  try {
    const userId = await getOptionalSocialUserId().catch(() => null);
    const req = parseFeedRequest(searchParams);
    const ip = getClientIP(request);

    const rl = await rateLimit("exploreFeed", userId || req.sessionId || ip, { limit: 120, window: 60 });
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const feedSession = userId
      ? { sid: null, issue: false }
      : await resolveOrIssueFeedSession(request.cookies.get(FEED_SESSION_COOKIE)?.value, req.sessionId ?? null, ip);

    const rawLocale = searchParams.get("locale") || "";
    const body = await serveFeed(req, {
      userId,
      // Doar sesiunea semnată e identitate (seen-set, snapshot) — nu session_id din query.
      sessionId: feedSession.sid,
      locale: isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE,
    });

    const res = NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
    if (feedSession.issue && feedSession.sid) setFeedSessionCookie(res, feedSession.sid);
    return res;
  } catch (err) {
    logger.error({ err }, "[explore/feed] failed");
    return NextResponse.json({ error: "feed_unavailable" }, { status: 500 });
  }
}
