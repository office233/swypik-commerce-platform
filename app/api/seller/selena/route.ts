/**
 * POST /api/seller/selena — proxy către Selena AI din ERP-ul seller-ului
 *
 * Selena (ERP Multi-ERP) expune POST /api/partner/selena/assist autentificat
 * cu X-Api-Key de partner. Seller-ul folosește cheia lui ERP (sellers.erp_api_key)
 * sau, dacă nu are ERP conectat, fallback pe env SELENA_ERP_URL + SELENA_ERP_API_KEY.
 *
 * Body: { task: "product_description"|"price_suggestion"|"customer_reply"|"chat",
 *         message: string, context?: string }
 * Răspuns: { success, answer, quota } — sau 402 la depășirea limitei de plan.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    task: z.enum(["product_description", "price_suggestion", "customer_reply", "chat"]).default("chat"),
    message: z.string().min(1).max(6000),
    context: z.string().max(4000).optional(),
});

async function POST_impl(req: Request): Promise<Response> {
    const sellerId = await getSellerSessionId();
    if (!sellerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await rateLimit("sellerProducts", `selena:${sellerId}`);
    if (!rl.success) return NextResponse.json({ error: "Prea multe cereri — încearcă în câteva minute" }, { status: 429 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Body invalid" }, { status: 400 });

    // ERP-ul seller-ului (preferat) sau ERP-ul platformei din env.
    const { rows: sellers } = await dbQuery<{
        erp_api_url: string | null;
        erp_api_key: string | null;
        erp_connected: boolean;
    }>(`SELECT erp_api_url, erp_api_key, erp_connected FROM sellers WHERE id=$1`, [sellerId]);
    const seller = sellers[0];

    let erpUrl = seller?.erp_connected ? seller.erp_api_url : null;
    let erpKey = seller?.erp_connected ? seller.erp_api_key : null;
    if (!erpUrl || !erpKey) {
        erpUrl = process.env.SELENA_ERP_URL || null;
        erpKey = process.env.SELENA_ERP_API_KEY || null;
    }
    if (!erpUrl || !erpKey) {
        return NextResponse.json(
            { error: "Selena nu este disponibilă — conectează întâi ERP-ul din Setări" },
            { status: 422 },
        );
    }

    let res: Response;
    try {
        res = await fetch(`${erpUrl.replace(/\/+$/, "")}/api/partner/selena/assist`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Key": erpKey },
            body: JSON.stringify(parsed.data),
            signal: AbortSignal.timeout(95000),
        });
    } catch (e) {
        logger.error({ sellerId, err: e }, "Selena ERP proxy failed");
        return NextResponse.json({ error: "ERP-ul nu răspunde — încearcă mai târziu" }, { status: 502 });
    }

    const data = await res.json().catch(() => ({}));
    if (res.status === 402) {
        return NextResponse.json(
            { error: "quota_exceeded", message: data?.message ?? "Limita lunară de mesaje Selena a fost atinsă." },
            { status: 402 },
        );
    }
    if (!res.ok) {
        logger.warn({ sellerId, status: res.status }, "Selena ERP returned error");
        return NextResponse.json({ error: data?.message ?? "Selena a întâmpinat o eroare" }, { status: 502 });
    }
    return NextResponse.json({ success: true, answer: data.answer, quota: data.quota });
}

export const POST = withErrorHandling(POST_impl);
