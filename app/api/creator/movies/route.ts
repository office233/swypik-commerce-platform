import { NextResponse } from "next/server";
import { z } from "zod";
import { getCreatorUserId } from "@/lib/creator/session";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseBody } from "@/lib/validation/schemas";
import { createSeries, isPublisher, listSeriesForOwner, creatorShareTotals } from "@/lib/movies/repository";
import { clampEpisodePrice } from "@/lib/movies/pricing";
import { slugifySeriesTitle } from "@/lib/movies/slug";
import { MOVIES_DEFAULT_EPISODE_PRICE_UNITS, MOVIES_DEFAULT_FREE_EPISODES, MOVIES_MAX_FREE_EPISODES } from "@/lib/movies/config";
import { LOCALES } from "@/lib/i18n/config";
import { MOVIE_GENRES } from "@/lib/movies/genres";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
    title: z.string().trim().min(2).max(120),
    synopsis: z.string().trim().max(2000).default(""),
    genres: z.array(z.enum(MOVIE_GENRES)).max(5).default([]),
    languageCode: z.enum(LOCALES).default("ro"),
    coverUrl: z.string().url().max(500).nullable().default(null),
    posterUrl: z.string().url().max(500).nullable().default(null),
    freeEpisodes: z.coerce.number().int().min(0).max(MOVIES_MAX_FREE_EPISODES).default(MOVIES_DEFAULT_FREE_EPISODES),
    episodePriceUnits: z.coerce.number().int().default(MOVIES_DEFAULT_EPISODE_PRICE_UNITS),
    isAdult: z.boolean().default(false),
    licenseNote: z.string().trim().max(1000).nullable().default(null),
});

export const GET = withErrorHandling(async function GET() {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const userId = await getCreatorUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const [publisher, series, earnings] = await Promise.all([isPublisher(userId), listSeriesForOwner(userId), creatorShareTotals(userId)]);
    return NextResponse.json({ publisher, series, earnings });
});

export const POST = withErrorHandling(async function POST(req: Request) {
    if (!isEnabled("movies")) return frozenResponse("movies");
    const userId = await getCreatorUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!(await isPublisher(userId))) return NextResponse.json({ error: "not_a_publisher" }, { status: 403 });
    const rl = await rateLimit("moviesPublish", userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const parsed = parseBody(CreateSchema, await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const d = parsed.data;
    const series = await createSeries({
        ownerUserId: userId,
        slug: slugifySeriesTitle(d.title),
        title: d.title,
        synopsis: d.synopsis,
        genres: d.genres,
        languageCode: d.languageCode,
        coverUrl: d.coverUrl,
        posterUrl: d.posterUrl,
        freeEpisodes: d.freeEpisodes,
        episodePriceUnits: clampEpisodePrice(d.episodePriceUnits),
        isAdult: d.isAdult,
        licenseNote: d.licenseNote,
    });
    return NextResponse.json({ series }, { status: 201 });
});
