/**
 * POST /api/seller/erp/sync — importa produse din ERP in Swypik
 *
 * Flow:
 *   1. Ia produsele din ERP (GET /api/swypik/products, paginat)
 *   2. Pentru fiecare produs ERP:
 *      a. Upsert in marketplace_products (sau actualizeaza stocul)
 *      b. Adauga/actualizeaza maparea in erp_product_mapping
 *   3. Returneaza statistici: importate, actualizate, erori
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface ERPProduct {
    external_product_id: string;
    sku: string;
    barcode: string;
    title: string;
    price_cents: number;
    currency: string;
    inventory_qty: number;
    unit: string;
    category: string;
    vat_rate: number;
    source_type: string;
}

export async function POST(_req: Request) {
    const sellerId = await getSellerSessionId();
    if (!sellerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await rateLimit("sellerProducts", `erp-sync:${sellerId}`);
    if (!rl.success) return NextResponse.json({ error: "Rate limit — incearca din nou in 5 minute" }, { status: 429 });

    // Ia credentialele ERP ale seller-ului.
    const { rows: sellers } = await dbQuery<{ erp_api_url: string | null; erp_api_key: string | null; erp_connected: boolean }>(
        `SELECT erp_api_url, erp_api_key, erp_connected FROM sellers WHERE id=$1`,
        [sellerId]
    );
    const seller = sellers[0];
    if (!seller?.erp_connected || !seller.erp_api_url || !seller.erp_api_key) {
        return NextResponse.json({ error: "ERP nu este conectat" }, { status: 422 });
    }

    let imported = 0;
    let updated = 0;
    let errors = 0;
    let page = 1;
    const SIZE = 100;

    // Pagineaza toate produsele ERP.
    while (true) {
        let products: ERPProduct[];
        try {
            const url = `${seller.erp_api_url}/api/swypik/products?page=${page}&size=${SIZE}`;
            const res = await fetch(url, {
                headers: { "X-Api-Key": seller.erp_api_key },
                signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) break;
            const data = await res.json();
            products = data.products ?? [];
            if (products.length === 0) break;
        } catch (e) {
            logger.error({ sellerId, page, err: e }, "ERP sync fetch failed");
            errors++;
            break;
        }

        // Upsert fiecare produs.
        for (const p of products) {
            try {
                // Verifica daca avem deja maparea.
                const { rows: mappings } = await dbQuery<{ marketplace_product_id: string | null }>(
                    `SELECT marketplace_product_id FROM erp_product_mapping WHERE seller_id=$1 AND erp_product_id=$2`,
                    [sellerId, p.external_product_id]
                );
                const existingMpId = mappings[0]?.marketplace_product_id;

                const slugBase = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70);
                const slug = `${slugBase}-${p.sku || p.external_product_id}`.slice(0, 80);
                const priceRon = Math.round(p.price_cents / 100 * 100) / 100;

                if (existingMpId) {
                    // Actualizeaza pret + stoc.
                    await dbQuery(
                        `UPDATE marketplace_products SET price_cents=$1, inventory_qty=$2, updated_at=NOW()
             WHERE id=$3 AND seller_id=$4`,
                        [p.price_cents, p.inventory_qty, existingMpId, sellerId]
                    );
                    updated++;
                } else {
                    // Creeaza produs nou.
                    const newId = crypto.randomUUID();
                    await dbQuery(
                        `INSERT INTO marketplace_products
               (id, seller_id, title, slug, price_cents, currency, category,
                status, inventory_qty, source_type, supplier_product_id, metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,'meister_erp',$9,$10)
             ON CONFLICT (seller_id, slug) DO UPDATE
               SET price_cents=EXCLUDED.price_cents, inventory_qty=EXCLUDED.inventory_qty, updated_at=NOW()`,
                        [
                            newId, sellerId, p.title, slug, p.price_cents, p.currency || "RON",
                            p.category, p.inventory_qty, p.external_product_id,
                            JSON.stringify({ sku: p.sku, barcode: p.barcode, unit: p.unit, vat_rate: p.vat_rate }),
                        ]
                    );
                    // Salveaza maparea.
                    await dbQuery(
                        `INSERT INTO erp_product_mapping (seller_id, erp_product_id, erp_sku, marketplace_product_id)
             VALUES ($1,$2,$3,$4) ON CONFLICT (seller_id, erp_product_id) DO UPDATE SET last_synced_at=NOW()`,
                        [sellerId, p.external_product_id, p.sku, newId]
                    );
                    imported++;
                }
            } catch (e) {
                logger.error({ sellerId, erpPid: p.external_product_id, err: e }, "ERP sync product upsert failed");
                errors++;
            }
        }

        if (products.length < SIZE) break;
        page++;
    }

    // Actualizeaza timestamp ultima sync.
    await dbQuery(`UPDATE sellers SET erp_last_sync=NOW() WHERE id=$1`, [sellerId]);

    // Log sync.
    await dbQuery(
        `INSERT INTO erp_sync_log (seller_id, products_imported, products_updated, status, error_msg)
     VALUES ($1,$2,$3,$4,$5)`,
        [sellerId, imported, updated, errors > 0 ? "error" : "ok", errors > 0 ? `${errors} produse cu erori` : null]
    );

    logger.info({ sellerId, imported, updated, errors }, "ERP sync complete");

    return NextResponse.json({
        success: true,
        imported,
        updated,
        errors,
        total: imported + updated,
        message: `Sync complet: ${imported} produse noi, ${updated} actualizate${errors > 0 ? `, ${errors} erori` : ""}.`,
    });
}
