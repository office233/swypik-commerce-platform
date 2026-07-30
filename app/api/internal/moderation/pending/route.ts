/**
 * GET /api/internal/moderation/pending — cereri care asteapta aprobare.
 *
 * Consumat de Multi-ERP (panoul de moderare). Unifica cele 4 tipuri de
 * entitati care se creeaza in stare "pending":
 *   seller   — cerere business (→ provisionare tenant ERP la aprobare)
 *   merchant — local_merchants (restaurant, farmacie, florarie…)
 *   courier  — curieri (verificare documente)
 *   cause    — donation_causes (verificare ONG/beneficiar)
 *
 * Query: ?type=seller|merchant|courier|cause|all (default all), ?limit=100
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyInternal, forbidden } from "../../_lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface PendingItem {
    type: "seller" | "merchant" | "courier" | "cause";
    id: string;
    name: string;
    status: string;
    created_at: string;
    detail: Record<string, unknown>;
}

export async function GET(req: Request) {
    if (!verifyInternal(req)) return forbidden();

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "all";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);

    const items: PendingItem[] = [];

    try {
        if (type === "all" || type === "seller") {
            const { rows } = await dbQuery<any>(
                `SELECT id, name, email, cui, phone, product_type, status, created_at,
                        business_details, erp_connected
                   FROM sellers
                  WHERE status = 'pending'
                  ORDER BY created_at ASC LIMIT $1`,
                [limit]
            );
            for (const r of rows) {
                items.push({
                    type: "seller", id: String(r.id), name: r.name || "(fara nume)",
                    status: r.status, created_at: r.created_at,
                    detail: {
                        email: r.email, phone: r.phone, cui: r.cui,
                        product_type: r.product_type, business_details: r.business_details,
                        erp_connected: r.erp_connected,
                    },
                });
            }
        }

        if (type === "all" || type === "merchant") {
            const { rows } = await dbQuery<any>(
                `SELECT id, name, kind, status, created_at, phone, email, address,
                        location_city, seller_id
                   FROM local_merchants
                  WHERE status = 'pending'
                  ORDER BY created_at ASC LIMIT $1`,
                [limit]
            );
            for (const r of rows) {
                items.push({
                    type: "merchant", id: String(r.id), name: r.name,
                    status: r.status, created_at: r.created_at,
                    detail: {
                        kind: r.kind, phone: r.phone, email: r.email,
                        address: r.address, city: r.location_city, seller_id: r.seller_id,
                    },
                });
            }
        }

        if (type === "all" || type === "courier") {
            const { rows } = await dbQuery<any>(
                `SELECT id, user_id, vehicle_type, verification_status, created_at,
                        phone, city
                   FROM couriers
                  WHERE verification_status IN ('pending', 'in_review')
                  ORDER BY created_at ASC LIMIT $1`,
                [limit]
            );
            for (const r of rows) {
                items.push({
                    type: "courier", id: String(r.id), name: `Curier ${String(r.id).slice(0, 8)}`,
                    status: r.verification_status, created_at: r.created_at,
                    detail: { user_id: r.user_id, vehicle_type: r.vehicle_type, phone: r.phone, city: r.city },
                });
            }
        }

        if (type === "all" || type === "cause") {
            const { rows } = await dbQuery<any>(
                `SELECT id, title, verification_status, created_at, category,
                        beneficiary_name, target_amount_cents
                   FROM donation_causes
                  WHERE verification_status IN ('pending', 'in_review')
                  ORDER BY created_at ASC LIMIT $1`,
                [limit]
            );
            for (const r of rows) {
                items.push({
                    type: "cause", id: String(r.id), name: r.title,
                    status: r.verification_status, created_at: r.created_at,
                    detail: {
                        category: r.category, beneficiary: r.beneficiary_name,
                        target_amount_cents: r.target_amount_cents,
                    },
                });
            }
        }
    } catch (e) {
        logger.error({ err: e }, "moderation pending query failed");
        return NextResponse.json({ error: "query_failed" }, { status: 500 });
    }

    items.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return NextResponse.json({ items, count: items.length });
}
