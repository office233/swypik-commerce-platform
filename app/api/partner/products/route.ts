/**
 * POST /api/partner/products — ERP push: publica/actualizeaza un produs pe Swypik.
 *
 * Modelul "ERP = sales panel": Multi-ERP impinge produsul cu X-Api-Key, Swypik
 * il afiseaza in marketplace. Upsert dupa (seller_id, external_id).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import { getPartnerSeller } from "../_lib/auth";
import { dispatchAppWebhook } from "@/lib/apps/webhooks";

export const dynamic = "force-dynamic";

const productSchema = z.object({
    external_id: z.string().min(1).max(64),
    title: z.string().min(1).max(300),
    description: z.string().max(10000).optional(),
    price: z.number().nonnegative(),
    currency: z.string().length(3).default("RON"),
    stock: z.number().nonnegative().default(0),
    sku: z.string().max(64).optional(),
    category: z.string().max(120).optional(),
    image_urls: z.array(z.string().url()).max(10).optional(),
});

export async function POST(req: Request) {
    const seller = await getPartnerSeller(req);
    if (!seller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await rateLimit("sellerProducts", `partner-push:${seller.id}`);
    if (!rl.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }
    const p = parsed.data;
    const priceCents = Math.round(p.price * 100);
    // marketplace_products nu are cantitate, ci inventory_status (enum).
    const inventoryStatus =
        p.stock <= 0 ? "out_of_stock" : p.stock < 5 ? "low_stock" : "in_stock";

    try {
        // Mapare existenta?
        const { rows: mappings } = await dbQuery<{ marketplace_product_id: string | null }>(
            `SELECT marketplace_product_id FROM erp_product_mapping WHERE seller_id=$1 AND erp_product_id=$2`,
            [seller.id, p.external_id]
        );
        const existingId = mappings[0]?.marketplace_product_id;

        if (existingId) {
            await dbQuery(
                `UPDATE marketplace_products
                    SET title=$1, price_cents=$2, inventory_status=$3, category=COALESCE($4, category),
                        description=COALESCE($5, description), updated_at=NOW()
                  WHERE id=$6 AND seller_id=$7`,
                [p.title, priceCents, inventoryStatus, p.category ?? null, p.description ?? null, existingId, seller.id]
            );
            await dbQuery(
                `UPDATE erp_product_mapping SET last_synced_at=NOW() WHERE seller_id=$1 AND erp_product_id=$2`,
                [seller.id, p.external_id]
            );
            void dispatchAppWebhook("product.updated", seller.id, {
                product_id: existingId,
                title: p.title,
                price_cents: priceCents,
                stock: p.stock,
            });
            return NextResponse.json({ id: existingId, updated: true });
        }

        const slugBase = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 70);
        const slug = `${slugBase}-${p.sku || p.external_id}`.slice(0, 80);
        const newId = crypto.randomUUID();
        await dbQuery(
            `INSERT INTO marketplace_products
               (id, seller_id, title, slug, description, price_cents, currency, category,
                status, inventory_status, source_type, external_product_id, image_url, metadata)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,'multi_erp',$10,$11,$12)`,
            [
                newId, seller.id, p.title, slug, p.description ?? null, priceCents,
                p.currency, p.category ?? null, inventoryStatus, p.external_id,
                p.image_urls?.[0] ?? null,
                JSON.stringify({ sku: p.sku ?? null, image_urls: p.image_urls ?? [] }),
            ]
        );
        await dbQuery(
            `INSERT INTO erp_product_mapping (seller_id, erp_product_id, erp_sku, marketplace_product_id)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (seller_id, erp_product_id)
               DO UPDATE SET marketplace_product_id=EXCLUDED.marketplace_product_id, last_synced_at=NOW()`,
            [seller.id, p.external_id, p.sku ?? null, newId]
        );
        void dispatchAppWebhook("product.updated", seller.id, {
            product_id: newId,
            title: p.title,
            price_cents: priceCents,
            stock: p.stock,
        });
        return NextResponse.json({ id: newId, created: true }, { status: 201 });
    } catch (e) {
        logger.error({ sellerId: seller.id, err: e }, "partner product push failed");
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
