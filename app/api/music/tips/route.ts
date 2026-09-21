import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { rateLimit } from "@/lib/security/rate-limit";
import { parseBody } from "@/lib/validation/schemas";
import { getArtistBySlug, getTrackBySlug } from "@/lib/music/repository";
import { tipArtist } from "@/lib/music/tip";
import { getSwypBalanceUnits } from "@/lib/swyp/ledger";
import { MUSIC_TIP_MAX_UNITS, MUSIC_TIP_MIN_UNITS } from "@/lib/music/config";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
    artistSlug: z.string().min(1).max(120),
    trackSlug: z.string().min(1).max(160).optional(),
    units: z.coerce.number().int().min(MUSIC_TIP_MIN_UNITS).max(MUSIC_TIP_MAX_UNITS),
    idempotencyKey: z.string().uuid(),
});

const FAILURE_STATUS = { invalid_units: 400, artist_not_found: 404, insufficient_balance: 402 } as const;

export const POST = withErrorHandling(async function POST(req: Request) {
    if (!isEnabled("music")) return frozenResponse("music");
    const user = await getAuthUser();
    if (!user.userId) return NextResponse.json({ error: "auth_required" }, { status: 401 });
    const rl = await rateLimit("musicTip", user.userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const parsed = parseBody(BodySchema, await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { artistSlug, trackSlug, units, idempotencyKey } = parsed.data;

    const artist = await getArtistBySlug(artistSlug);
    if (!artist) return NextResponse.json({ error: "artist_not_found" }, { status: 404 });

    // Piesa opțională trebuie să aparțină chiar artistului tip-uit — altfel un
    // client rău-intenționat ar putea atribui tip-ul unui artist pe o piesă străină.
    let trackId: string | null = null;
    if (trackSlug) {
        const track = await getTrackBySlug(trackSlug);
        if (!track || track.artist_user_id !== artist.user_id) {
            return NextResponse.json({ error: "invalid_body" }, { status: 400 });
        }
        trackId = track.id;
    }

    const result = await tipArtist({ userId: user.userId, artistUserId: artist.user_id, trackId, units, idempotencyKey });

    const balanceUnits = Number(await getSwypBalanceUnits(user.userId));
    if (!result.ok) {
        return NextResponse.json({ error: result.reason, balanceUnits }, { status: FAILURE_STATUS[result.reason] });
    }
    return NextResponse.json({ ...result, balanceUnits });
});
