/**
 * POST /api/squad/[id]/join — alăturare într-un squad existent
 */
import { NextResponse } from "next/server";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { getAuthSession } from "@/lib/auth/session";
import { joinSquadGroup } from "@/lib/squad/engine";
import { rateLimit } from "@/lib/security/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const joinSchema = z.object({
    userName: z.string().min(1).max(100).optional(),
    userAvatar: z.string().url().optional(),
});

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!isEnabled("squadBuy")) return frozenResponse("squadBuy");
    const { id } = await params;
    const session = await getAuthSession().catch(() => null);
    const rl = await rateLimit("squad:join", session?.userId ?? req.headers.get("cf-connecting-ip") ?? "anon");
    if (!rl.success) {
        return NextResponse.json({ error: "Prea multe cereri. Încearcă mai târziu." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = joinSchema.safeParse(body);

    const result = await joinSquadGroup({
        squadId: id,
        userId: session?.userId ?? null,
        userName: parsed.success ? parsed.data.userName : undefined,
        userAvatar: parsed.success ? parsed.data.userAvatar : undefined,
    });

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, squad: result.squad });
}
