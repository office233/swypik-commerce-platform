/**
 * Partner API auth — ERP-urile (Multi-ERP) push-uiesc produse cu X-Api-Key.
 * Cheia = sellers.erp_api_key (aceeasi cheie folosita si pentru pull).
 *
 * ERP-first auto-provision: daca cheia nu exista inca, dar request-ul vine
 * semnat cu secretul partner (X-Partner-Secret == PARTNER_PROVISION_SECRET)
 * si aduce numele firmei (X-Company-Name), cream automat:
 *   - un profil seller activ + verificat (bifa albastra) cu numele firmei,
 *   - un user de aplicatie cu rol 'seller' legat de profil (poate posta
 *     produse si clipuri si din mobil).
 * Firma isi poate edita ulterior profilul din panoul de seller.
 */
import { dbQuery } from "@/lib/db";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import crypto from "crypto";

export interface PartnerSeller {
    id: string;
    display_name: string | null;
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "seller";
}

function safeEqual(a: string, b: string): boolean {
    const ha = crypto.createHash("sha256").update(a).digest();
    const hb = crypto.createHash("sha256").update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

async function autoProvisionSeller(req: Request, apiKey: string): Promise<PartnerSeller | null> {
    const secret = process.env.PARTNER_PROVISION_SECRET;
    const given = req.headers.get("x-partner-secret");
    const companyName = (req.headers.get("x-company-name") || "").trim().slice(0, 120);
    const companyCui = (req.headers.get("x-company-cui") || "").trim().slice(0, 32) || null;
    const companyEmail = (req.headers.get("x-company-email") || "").trim().toLowerCase().slice(0, 160) || null;
    if (!secret || secret.length < 24 || !given || !safeEqual(given, secret)) return null;
    if (!companyName) return null;

    const pool = getDb();
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Email unic obligatoriu in sellers — derivam unul stabil daca ERP-ul nu trimite.
        const email = companyEmail
            || `erp+${crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}@partners.swypik.com`;

        // User de aplicatie pentru firma (rol seller, bifa albastra).
        const username = `${slugify(companyName)}-${crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 6)}`;
        const userRes = await client.query(
            `INSERT INTO users (external_auth_id, username, display_name, role, is_verified)
             VALUES ($1, $2, $3, 'seller', true)
                         ON CONFLICT (external_auth_id) WHERE external_auth_id IS NOT NULL
                             DO UPDATE SET display_name = EXCLUDED.display_name
             RETURNING id`,
            [`erp:${crypto.createHash("sha256").update(apiKey).digest("hex")}`, username, companyName]
        );
        const userId = userRes.rows[0].id;

        const sellerRes = await client.query(
            `INSERT INTO sellers (name, email, cui, status, erp_api_key, erp_connected, erp_tenant_name, is_verified, user_id, business_details)
             VALUES ($1, $2, $3, 'active', $4, true, $1, true, $5, jsonb_build_object('source', 'erp_auto_provision'))
             ON CONFLICT (email) DO UPDATE SET
               erp_api_key = EXCLUDED.erp_api_key,
               erp_connected = true,
               user_id = COALESCE(sellers.user_id, EXCLUDED.user_id)
             RETURNING id, name AS display_name`,
            [companyName, email, companyCui, apiKey, userId]
        );

        await client.query("COMMIT");
        logger.info({ seller: sellerRes.rows[0].id, company: companyName }, "partner auto-provisioned seller");
        return sellerRes.rows[0];
    } catch (error) {
        await client.query("ROLLBACK").catch(() => { });
        logger.error({ error: String(error) }, "partner auto-provision failed");
        return null;
    } finally {
        client.release();
    }
}

export async function getPartnerSeller(req: Request): Promise<PartnerSeller | null> {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || apiKey.length < 16) return null;
    const { rows } = await dbQuery<PartnerSeller>(
        `SELECT id, name AS display_name FROM sellers WHERE erp_api_key = $1 AND erp_connected = true LIMIT 1`,
        [apiKey]
    );
    if (rows[0]) return rows[0];
    // ERP-first: primul push creeaza profilul firmei automat.
    return autoProvisionSeller(req, apiKey);
}
