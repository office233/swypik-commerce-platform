/**
 * Comenzi locale (food delivery) — plasare + listare.
 *
 * POST /api/local-orders — clientul plasează o comandă la un merchant.
 *   Prețurile se recalculează integral server-side din menu_items
 *   (inputul clientului conține doar id-uri + cantități).
 *   Totul rulează într-o tranzacție.
 *
 * GET /api/local-orders — comenzile clientului logat.
 */
import { NextResponse } from "next/server";
import { dbQuery, withTransaction } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { LocalOrderCreateSchema, parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";
import { maybeAutoDispatch } from "@/lib/dispatch/auto";
import { resolveDeliveryFee } from "@/lib/pricing/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MenuOptionChoice {
    id?: string;
    name: string;
    price_cents?: number;
}
interface MenuOption {
    name: string;
    required?: boolean;
    max?: number;
    choices?: MenuOptionChoice[];
}

export async function POST(req: Request) {
    try {
        const session = await getAuthSession();
        const userId = session?.userId ?? null;

        const rl = await rateLimit("localOrders", userId ?? req.headers.get("cf-connecting-ip") ?? "anon");
        if (!rl.success) {
            return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
        }

        const raw = await req.json().catch(() => null);
        const parsed = parseBody(LocalOrderCreateSchema, raw);
        if (!parsed.ok) {
            return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
        }
        const d = parsed.data;

        // Merchant activ + deschis
        const { rows: merchants } = await dbQuery(
            `SELECT id, name, status, min_order_cents, delivery_fee_cents, is_open_override, avg_prep_minutes,
                location_city, location_country, location_lat, location_lng
         FROM local_merchants WHERE id = $1`,
            [d.merchant_id],
        );
        const merchant = merchants[0];
        if (!merchant || merchant.status !== "active") {
            return NextResponse.json({ success: false, error: "Restaurantul nu e disponibil." }, { status: 404 });
        }
        if (merchant.is_open_override === false) {
            return NextResponse.json({ success: false, error: "Restaurantul este închis momentan." }, { status: 409 });
        }

        // Prețuri DIN DB, nu din client.
        const itemIds = d.items.map((i) => i.menu_item_id);
        const { rows: menuItems } = await dbQuery(
            `SELECT id, name, price_cents, currency, options, is_available
         FROM menu_items WHERE merchant_id = $1 AND id = ANY($2::uuid[])`,
            [d.merchant_id, itemIds],
        );
        const byId = new Map(menuItems.map((m: any) => [m.id, m]));

        let subtotal = 0;
        const orderItems: unknown[] = [];
        for (const item of d.items) {
            const mi = byId.get(item.menu_item_id) as any;
            if (!mi || !mi.is_available) {
                return NextResponse.json(
                    { success: false, error: `Un produs din coș nu mai e disponibil.` },
                    { status: 409 },
                );
            }
            let unit = mi.price_cents as number;
            const chosenOptions: { name: string; price_cents: number }[] = [];
            if (item.option_ids?.length) {
                const opts = (mi.options ?? []) as MenuOption[];
                const allChoices = opts.flatMap((o) =>
                    (o.choices ?? []).map((c) => ({ ...c, _id: c.id ?? `${o.name}:${c.name}` })),
                );
                for (const oid of item.option_ids) {
                    const choice = allChoices.find((c) => c._id === oid || c.name === oid);
                    if (!choice) {
                        return NextResponse.json({ success: false, error: "Opțiune invalidă." }, { status: 400 });
                    }
                    unit += choice.price_cents ?? 0;
                    chosenOptions.push({ name: choice.name, price_cents: choice.price_cents ?? 0 });
                }
            }
            subtotal += unit * item.qty;
            orderItems.push({
                menu_item_id: mi.id,
                name: mi.name,
                qty: item.qty,
                unit_price_cents: unit,
                options: chosenOptions,
                notes: item.notes ?? null,
            });
        }

        if (subtotal < (merchant.min_order_cents ?? 0)) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Comanda minimă este ${((merchant.min_order_cents ?? 0) / 100).toFixed(2)} RON.`,
                },
                { status: 400 },
            );
        }

                // Taxă de livrare: dinamică (zonă + distanță + surge) cu fallback la fee fix.
                const feeResult = await resolveDeliveryFee({
                        merchant,
                        dropoff: { lat: d.delivery_lat ?? null, lng: d.delivery_lng ?? null },
                });
                const deliveryFee = feeResult.fee_cents;
        const total = subtotal + deliveryFee + d.tip_cents;

        const order = await withTransaction(async (q) => {
            const { rows } = await q(
                `INSERT INTO local_orders (
           merchant_id, customer_user_id, customer_name, customer_phone,
           delivery_address, delivery_lat, delivery_lng, delivery_notes,
           items, subtotal_cents, delivery_fee_cents, tip_cents, total_cents,
                     payment_method, estimated_delivery_at,
                     delivery_distance_km, delivery_fee_breakdown, surge_multiplier, pricing_zone_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9::jsonb, $10, $11, $12, $13, $14,
                     now() + make_interval(mins => $15),
                     $16, $17::jsonb, $18, $19
         )
         RETURNING id, order_number, status, total_cents, currency, estimated_delivery_at`,
                [
                    d.merchant_id,
                    userId,
                    d.customer_name,
                    d.customer_phone,
                    d.delivery_address,
                    d.delivery_lat ?? null,
                    d.delivery_lng ?? null,
                    d.delivery_notes ?? null,
                    JSON.stringify(orderItems),
                    subtotal,
                    deliveryFee,
                    d.tip_cents,
                    total,
                    d.payment_method,
                    (merchant.avg_prep_minutes ?? 20) + 25,
                    feeResult.distance_km,
                    feeResult.breakdown ? JSON.stringify(feeResult.breakdown) : null,
                    feeResult.surge_multiplier,
                    feeResult.zone_id,
                ],
            );
            return rows[0];
        });

        // Auto-dispatch la plasare, dacă merchantul are auto_dispatch_on='placed'.
        await maybeAutoDispatch(order.id, "placed");

        return NextResponse.json({ success: true, order });
    } catch (error: unknown) {
        logger.error({ err: error }, "[local-orders] POST error");
        return NextResponse.json({ success: false, error: "Eroare la plasarea comenzii." }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const session = await getAuthSession();
        if (!session?.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        const url = new URL(req.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);

        const { rows } = await dbQuery(
            `SELECT lo.id, lo.order_number, lo.status, lo.items, lo.total_cents, lo.currency,
              lo.payment_method, lo.placed_at, lo.estimated_delivery_at,
              m.name AS merchant_name, m.image_url AS merchant_image,
              c.full_name AS courier_name, c.current_lat AS courier_lat, c.current_lng AS courier_lng
         FROM local_orders lo
         JOIN local_merchants m ON m.id = lo.merchant_id
         LEFT JOIN couriers c ON c.id = lo.courier_id
        WHERE lo.customer_user_id = $1
        ORDER BY lo.placed_at DESC
        LIMIT $2`,
            [session.userId, limit],
        );
        return NextResponse.json({ success: true, orders: rows });
    } catch (error: unknown) {
        logger.error({ err: error }, "[local-orders] GET error");
        return NextResponse.json({ success: false, error: "Eroare." }, { status: 500 });
    }
}
