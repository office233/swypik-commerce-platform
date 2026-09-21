import { NextResponse } from "next/server";
import { z } from "zod";
import { getCreatorUserId } from "@/lib/creator/session";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { parseBody } from "@/lib/validation/schemas";
import { getSeriesById, listEpisodes, updateSeries } from "@/lib/movies/repository";
import { clampEpisodePrice } from "@/lib/movies/pricing";
import { MOVIES_MAX_FREE_EPISODES } from "@/lib/movies/config";
import { MOVIE_GENRES } from "@/lib/movies/genres";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
    title: z.string().trim().min(2).max(120).optional(),
    synopsis: z.string().trim().max(2000).optional(),
    genres: z.array(z.enum(MOVIE_GENRES)).max(5).optional(),
    coverUrl: z.string().url().max(500).nullable().optional(),
    posterUrl: z.string().url().max(500).nullable().optional(),
    freeEpisodes: z.coerce.number().int().min(0).max(MOVIES_MAX_FREE_EPISODES).optional(),
    episodePriceUnits: z.coerce.number().int().optional(),
    isAdult: z.boolean().optional(),
    licenseNote: z.string().trim().max(1000).nullable().optional(),
    /** Creatorul poate doar trimite la review sau retrage în draft; publicarea e a adminului. */
    status: z.enum(["draft", "pending_review"]).optional(),
});

export const GET = withErrorHandling(async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const userId = await getCreatorUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;
    const series = await getSeriesById(id);
    if (!series || series.owner_user_id !== userId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ series, episodes: await listEpisodes(id) });
});

export const PATCH = withErrorHandling(async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const userId = await getCreatorUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsed = parseBody(PatchSchema, await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const patch = {
        ...parsed.data,
        ...(parsed.data.episodePriceUnits !== undefined ? { episodePriceUnits: clampEpisodePrice(parsed.data.episodePriceUnits) } : {}),
    };
    if (patch.status === "pending_review") {
        const current = await getSeriesById(id);
        if (!current || current.owner_user_id !== userId) return NextResponse.json({ error: "not_found" }, { status: 404 });
        if (!(current.license_note ?? patch.licenseNote)) return NextResponse.json({ error: "license_note_required" }, { status: 422 });
    }
    const series = await updateSeries(id, userId, patch);
    if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ series });
});
