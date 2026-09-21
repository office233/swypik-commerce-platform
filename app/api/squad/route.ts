/**
 * GET  /api/squad — listă squad-uri active
 * POST /api/squad — crează un nou squad pentru un produs
 */
import { NextResponse } from "next/server";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { getAuthSession } from "@/lib/auth/session";
import { createSquadGroup, getActiveSquads, getActiveSquadsForProduct } from "@/lib/squad/engine";
import { rateLimit } from "@/lib/security/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
    productId: z.string().uuid(),
    userName: z.string().min(1).max(100).optional(),
    userAvatar: z.string().url().optional(),
});

export async function GET(req: Request) {
    if (!isEnabled("squadBuy")) return frozenResponse("squadBuy");
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (productId) {
        const squads = await getActiveSquadsForProduct(productId, 10);
        return NextResponse.json({ success: true, squads });
    }

    const squads = await getActiveSquads(20);
    return NextResponse.json({ success: true, squads });
}

export async function POST(req: Request) {
    if (!isEnabled("squadBuy")) return frozenResponse("squadBuy");
    const session = await getAuthSession().catch(() => null);
    const rl = await rateLimit("squad:create", session?.userId ?? req.headers.get("cf-connecting-ip") ?? "anon");
    if (!rl.success) {
        return NextResponse.json({ error: "Prea multe cereri. Încearcă mai târziu." }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }

    const result = await createSquadGroup({
        productId: parsed.data.productId,
        userId: session?.userId ?? null,
        userName: parsed.data.userName ?? (session as any)?.user?.name ?? "Cumpărător Swypik",
        userAvatar: parsed.data.userAvatar ?? (session as any)?.user?.avatar,
    });

    if (!result) {
        return NextResponse.json({ error: "Produsul nu a fost găsit sau nu e disponibil." }, { status: 404 });
    }

    return NextResponse.json({ success: true, squad: result.squad, shareUrl: result.shareUrl });
}
