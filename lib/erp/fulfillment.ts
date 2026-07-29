/**
 * ERP Fulfillment — trimite comenzile platite catre Meister ERP
 *
 * Apelat din Stripe webhook dupa payment.succeeded pentru:
 * - Scadere stoc in ERP
 * - Notificare depozit
 * - Creare comanda in ERP pentru livrare
 */

import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import crypto from "crypto";

export interface OrderItem {
    product_id: string;
    sku?: string;
    title: string;
    quantity: number;
    unit_amount_cents: number;
    seller_id: string;
}

export interface CustomerInfo {
    name: string;
    email: string;
    phone?: string;
    address?: object;
}

/**
 * Trimite comanda la ERP-ul seller-ului (daca e conectat).
 * Best-effort: eroarea NU anuleaza comanda — logam si continuam.
 */
export async function notifyERPFulfillment(
    swypikOrderId: string,
    sellerId: string,
    items: OrderItem[],
    customer: CustomerInfo,
    totalCents: number,
    currency = "RON"
): Promise<void> {
    // Ia datele ERP ale seller-ului.
    const { rows: sellers } = await dbQuery<{
        erp_api_url: string | null;
        erp_api_key: string | null;
        erp_connected: boolean;
    }>(
        `SELECT erp_api_url, erp_api_key, erp_connected FROM sellers WHERE id=$1`,
        [sellerId]
    );
    const seller = sellers[0];

    if (!seller?.erp_connected || !seller.erp_api_url || !seller.erp_api_key) {
        logger.debug({ sellerId }, "ERP not connected — skip fulfillment notification");
        return;
    }

    // Construim payload-ul pentru Meister ERP.
    // Mapam productele Swypik → ERP product IDs (din erp_product_mapping).
    const { rows: mappings } = await dbQuery<{ marketplace_product_id: string; erp_product_id: string; erp_sku: string }>(
        `SELECT marketplace_product_id, erp_product_id, erp_sku FROM erp_product_mapping WHERE seller_id=$1`,
        [sellerId]
    );
    const mpToErp = new Map(mappings.map((m) => [m.marketplace_product_id, m]));

    const erpItems = items.map((item) => {
        const mapping = mpToErp.get(item.product_id);
        return {
            external_product_id: mapping?.erp_product_id || item.product_id,
            sku: mapping?.erp_sku || item.sku || "",
            title: item.title,
            qty: item.quantity,
            unit_price_cents: item.unit_amount_cents,
        };
    });

    const body = JSON.stringify({
        swypik_order_id: swypikOrderId,
        seller_id: sellerId,
        customer: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone || "",
        },
        shipping_address: customer.address || {},
        items: erpItems,
        total_cents: totalCents,
        currency,
    });

    // HMAC-SHA256 semnatura cu API key-ul seller-ului.
    const sig = crypto
        .createHmac("sha256", seller.erp_api_key)
        .update(body)
        .digest("hex");

    try {
        const res = await fetch(`${seller.erp_api_url}/api/swypik/orders/webhook`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": seller.erp_api_key,
                "X-Webhook-Signature": sig,
            },
            body,
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            const err = await res.text().catch(() => "");
            logger.error({ sellerId, swypikOrderId, status: res.status, err }, "ERP fulfillment notify failed");
            return;
        }

        const data = await res.json();
        logger.info({ sellerId, swypikOrderId, erpOrderId: data.order_id }, "ERP fulfillment notified");

        // Actualizeaza comanda Swypik cu ERP order ID.
        await dbQuery(
            `UPDATE commerce_orders SET metadata = metadata || $1 WHERE stripe_session_metadata->>'swypik_order_id' = $2`,
            [JSON.stringify({ erp_order_id: data.order_id, erp_status: data.status }), swypikOrderId]
        );
    } catch (e: any) {
        logger.error({ sellerId, swypikOrderId, err: e.message }, "ERP fulfillment notify exception");
    }
}
