import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { listSeriesForAdmin } from "@/lib/movies/repository";
import type { SeriesStatus } from "@/lib/movies/types";

export const dynamic = "force-dynamic";
const STATUSES: SeriesStatus[] = ["draft", "pending_review", "published", "archived"];

export const GET = withErrorHandling(async function GET(req: Request) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const auth = await requireAuth(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;
    const raw = new URL(req.url).searchParams.get("status");
    const status = STATUSES.includes(raw as SeriesStatus) ? (raw as SeriesStatus) : undefined;
    return NextResponse.json({ series: await listSeriesForAdmin(status) });
});
