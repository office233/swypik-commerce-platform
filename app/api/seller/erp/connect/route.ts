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
import { safeFetch, UnsafeUrlError, assertPublicHttpsUrl } from "@/lib/security/ssrf";
import { isErpKeyUsedByOtherSeller, saveSellerErpConnection } from "@/lib/seller/erp-credentials";
import { z } from "zod";

const ConnectSchema = z.object({
    erp_api_url: z.string().trim().min(1).max(500),
    erp_api_key: z.string().trim().min(16).max(256),
});

export const dynamic = "force-dynamic";

// Helper: verifica conexiunea ERP si returneaza nr produse disponibile.
async function testERPConnection(
    apiUrl: string,
    apiKey: string
): Promise<{ ok: boolean; productCount?: number; error?: string }> {
    try {
        const url = new URL("/api/swypik/products?page=1&size=1", apiUrl).toString();
        // Anti-SSRF: https + adrese publice (DNS re-verificat), fără redirect-uri.
        const res = await safeFetch(url, {
            headers: { "X-Api-Key": apiKey },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            return { ok: false, error: "ERP-ul nu a acceptat conexiunea." };
        }
        const data = await res.json();
        if (!data.success) {
            return { ok: false, error: "ERP-ul a respins cheia API." };
        }
        return { ok: true, productCount: data.products?.length ?? 0 };
    } catch (e) {
        logger.warn({ err: e }, "[seller/erp/connect] probe failed");
        return { ok: false, error: "Conexiune eșuată." };
    }
}

// POST — conecteaza ERP
export async function POST(req: Request) {
    const sellerId = await getSellerSessionId();
    if (!sellerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await rateLimit("sellerProducts", sellerId);
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const parsed = ConnectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "erp_api_url si erp_api_key sunt obligatorii" }, { status: 400 });
    }
    const { erp_api_url, erp_api_key } = parsed.data;

    // Valideaza URL-ul: doar https catre adrese publice (anti-SSRF).
    let parsedUrl: URL;
    try {
        parsedUrl = await assertPublicHttpsUrl(erp_api_url);
    } catch (e) {
        const reason = e instanceof UnsafeUrlError ? e.reason : "invalid_url";
        return NextResponse.json({ error: "URL invalid", reason }, { status: 400 });
    }

    // O cheie de partner identifică un singur seller.
    if (await isErpKeyUsedByOtherSeller(sellerId, erp_api_key)) {
        return NextResponse.json({ error: "erp_key_in_use" }, { status: 409 });
    }

    // Testeaza conexiunea inainte de a salva.
    const test = await testERPConnection(parsedUrl.origin, erp_api_key);
    if (!test.ok) {
        return NextResponse.json({ error: `Conexiune ERP esuata: ${test.error}` }, { status: 422 });
    }

    // Cheia: hash (autentificare partner) + criptată (apeluri către ERP), niciodată în clar.
    await saveSellerErpConnection(sellerId, parsedUrl.origin, erp_api_key);

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
        `UPDATE sellers
            SET erp_api_url=NULL, erp_api_key=NULL, erp_api_key_hash=NULL, erp_api_key_enc=NULL, erp_connected=false
          WHERE id=$1`,
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
