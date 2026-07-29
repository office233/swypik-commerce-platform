/**
 * Meister ERP Connect — API Routes pentru seller
 *
 * POST /api/seller/erp/connect  → conecteaza ERP (salveaza URL + key)
 * DELETE /api/seller/erp/connect → deconecteaza ERP
 * GET /api/seller/erp/connect   → statusul conexiunii
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Helper: verifica conexiunea ERP si returneaza nr produse disponibile.
async function testERPConnection(
    apiUrl: string,
    apiKey: string
): Promise<{ ok: boolean; productCount?: number; error?: string }> {
    try {
        const url = new URL("/api/swypik/products?page=1&size=1", apiUrl).toString();
        const res = await fetch(url, {
            headers: { "X-Api-Key": apiKey },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            return { ok: false, error: `ERP a raspuns cu status ${res.status}` };
        }
        const data = await res.json();
        if (!data.success) {
            return { ok: false, error: data.error || "ERP a respins cheia API" };
        }
        return { ok: true, productCount: data.products?.length ?? 0 };
    } catch (e: any) {
        return { ok: false, error: e.message || "Conexiune esuata" };
    }
}

// POST — conecteaza ERP
export async function POST(req: Request) {
    const sellerId = await getSellerSessionId();
    if (!sellerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await rateLimit("sellerProducts", sellerId);
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    let body: { erp_api_url: string; erp_api_key: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { erp_api_url, erp_api_key } = body;
    if (!erp_api_url || !erp_api_key) {
        return NextResponse.json({ error: "erp_api_url si erp_api_key sunt obligatorii" }, { status: 400 });
    }

    // Valideaza URL-ul.
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(erp_api_url);
        if (!["https:", "http:"].includes(parsedUrl.protocol)) throw new Error();
    } catch {
        return NextResponse.json({ error: "URL invalid" }, { status: 400 });
    }

    // Testeaza conexiunea inainte de a salva.
    const test = await testERPConnection(parsedUrl.origin, erp_api_key);
    if (!test.ok) {
        return NextResponse.json({ error: `Conexiune ERP esuata: ${test.error}` }, { status: 422 });
    }

    // Salveaza (cheia e stocata plain — in productie: encrypt cu KMS).
    await dbQuery(
        `UPDATE sellers SET erp_api_url=$1, erp_api_key=$2, erp_connected=true, erp_last_sync=NOW()
     WHERE id=$3`,
        [parsedUrl.origin, erp_api_key, sellerId]
    );

    logger.info({ sellerId, erpUrl: parsedUrl.origin }, "ERP connected");

    return NextResponse.json({
        success: true,
        connected: true,
        erp_url: parsedUrl.origin,
        product_count: test.productCount,
        message: `ERP conectat cu succes. ${test.productCount} produse disponibile pentru import.`,
    });
}

// DELETE — deconecteaza ERP
export async function DELETE(_req: Request) {
    const sellerId = await getSellerSessionId();
    if (!sellerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbQuery(
        `UPDATE sellers SET erp_api_url=NULL, erp_api_key=NULL, erp_connected=false WHERE id=$1`,
        [sellerId]
    );

    return NextResponse.json({ success: true, connected: false });
}

// GET — status conexiune
export async function GET(_req: Request) {
    const sellerId = await getSellerSessionId();
    if (!sellerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { rows } = await dbQuery<{ erp_api_url: string | null; erp_connected: boolean; erp_last_sync: string | null }>(
        `SELECT erp_api_url, erp_connected, erp_last_sync FROM sellers WHERE id=$1`,
        [sellerId]
    );
    const s = rows[0];
    return NextResponse.json({
        connected: s?.erp_connected ?? false,
        erp_url: s?.erp_api_url ?? null,
        last_sync: s?.erp_last_sync ?? null,
    });
}
