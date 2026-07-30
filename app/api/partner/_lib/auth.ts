/**
 * Partner API auth — ERP-urile (Multi-ERP) push-uiesc produse cu X-Api-Key.
 * Cheia = sellers.erp_api_key (aceeasi cheie folosita si pentru pull).
 */
import { dbQuery } from "@/lib/db";

export interface PartnerSeller {
    id: string;
    display_name: string | null;
}

export async function getPartnerSeller(req: Request): Promise<PartnerSeller | null> {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || apiKey.length < 16) return null;
    const { rows } = await dbQuery<PartnerSeller>(
        `SELECT id, display_name FROM sellers WHERE erp_api_key = $1 AND erp_connected = true LIMIT 1`,
        [apiKey]
    );
    return rows[0] ?? null;
}
