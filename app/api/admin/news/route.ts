import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { ADMIN_NEWS_STATUSES, listArticlesForAdmin, type AdminNewsStatus } from "@/lib/news/admin-repository";
import { getNewsAiConfig, getNewsPublishMode } from "@/lib/news/config";

export const dynamic = "force-dynamic";

const PAGE = 50;

/** GET /api/admin/news?status=draft|published|archived&offset= — review queue + archive. */
export const GET = withErrorHandling(async function GET(req: Request) {
  if (!isEnabled("news")) return frozenResponse("news");
  const auth = await requireAuth(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const raw = url.searchParams.get("status");
  const status: AdminNewsStatus = (ADMIN_NEWS_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as AdminNewsStatus) : "draft";
  const offset = Math.max(0, Math.trunc(Number(url.searchParams.get("offset")) || 0));

  const articles = await listArticlesForAdmin(status, PAGE, offset);
  return NextResponse.json({
    articles,
    publishMode: getNewsPublishMode(),
    aiConfigured: getNewsAiConfig() !== null,
  });
});
