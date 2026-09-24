import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { parseBody } from "@/lib/validation/schemas";
import { dbQuery } from "@/lib/db";
import { logAdminAction } from "@/lib/security/admin-audit";
import { getSeriesById, listEpisodes, updateSeries } from "@/lib/movies/repository";
import { clampEpisodePrice } from "@/lib/movies/pricing";
import { MOVIES_MAX_FREE_EPISODES } from "@/lib/movies/config";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
    status: z.enum(["draft", "pending_review", "published", "archived"]).optional(),
    freeEpisodes: z.coerce.number().int().min(0).max(MOVIES_MAX_FREE_EPISODES).optional(),
    episodePriceUnits: z.coerce.number().int().optional(),
    isAdult: z.boolean().optional(),
    trailerVideoId: z.string().uuid().nullable().optional(),
});

export const GET = withErrorHandling(async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const auth = await requireAuth(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const series = await getSeriesById(id);
    if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ series, episodes: await listEpisodes(id) });
});

export const PATCH = withErrorHandling(async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const auth = await requireAuth(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const parsed = parseBody(PatchSchema, await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (parsed.data.status === "published") {
        // Publicarea cere: license_note, cel puțin un episod, toate episoadele aprobate la moderare.
        const series = await getSeriesById(id);
        if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });
        if (!series.license_note) return NextResponse.json({ error: "license_note_required" }, { status: 422 });
        const { rows } = await dbQuery<{ total: string; approved: string }>(
            `SELECT COUNT(*)::text AS total,
                    COUNT(*) FILTER (WHERE v.moderation_status = 'approved' AND v.status = 'ready')::text AS approved
               FROM movie_episodes e JOIN videos v ON v.id = e.video_id WHERE e.series_id = $1`,
            [id],
        );
        if (Number(rows[0]?.total ?? 0) === 0) return NextResponse.json({ error: "no_episodes" }, { status: 422 });
        if (rows[0].total !== rows[0].approved) return NextResponse.json({ error: "episodes_not_approved" }, { status: 422 });
    }
    const patch = {
        ...parsed.data,
        ...(parsed.data.episodePriceUnits !== undefined ? { episodePriceUnits: clampEpisodePrice(parsed.data.episodePriceUnits) } : {}),
    };
    const series = await updateSeries(id, null, patch);
    if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await logAdminAction({ action: "movie_series.update", targetType: "movie_series", targetId: id, details: patch, req });
    return NextResponse.json({ series });
});
