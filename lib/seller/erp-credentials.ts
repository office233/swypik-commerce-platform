/**
 * Credențialele ERP ale seller-ului (audit seller/courier 2026-09).
 *
 * Aceeași cheie are două roluri:
 *   - intrare: ERP-ul ne apelează pe /api/partner cu X-Api-Key → căutare după
 *     `erp_api_key_hash` (sha256, nu mai comparăm text în clar);
 *   - ieșire: noi apelăm ERP-ul seller-ului cu cheia → `erp_api_key_enc`
 *     (AES-256-GCM, lib/security/secret-box).
 * Coloana veche `erp_api_key` (text clar) e golită la prima folosire
 * (migrare leneșă — cheia nu poate fi criptată din SQL).
 */
import crypto from "node:crypto";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";

const PURPOSE = "seller-erp-api-key";

export function hashErpKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

export function encryptErpKey(key: string): string {
  return encryptSecret(PURPOSE, key);
}

export function decryptErpKey(stored: string): string {
  return decryptSecret(PURPOSE, stored);
}

type CredRow = {
  erp_api_url: string | null;
  erp_api_key: string | null;
  erp_api_key_enc: string | null;
  erp_connected: boolean;
};

export type ErpCredentials = { url: string; key: string };

/** Mută o cheie în clar în coloanele hash/enc și golește textul clar. */
async function upgradePlaintextKey(sellerId: string, key: string): Promise<void> {
  await dbQuery(
    `UPDATE sellers SET erp_api_key_hash = $2, erp_api_key_enc = $3, erp_api_key = NULL WHERE id = $1`,
    [sellerId, hashErpKey(key), encryptErpKey(key)],
  ).catch((err) => logger.warn({ err, sellerId }, "[erp-credentials] plaintext key upgrade failed"));
}

/** Credențialele pentru apelurile către ERP-ul seller-ului (null = neconectat). */
export async function getSellerErpCredentials(sellerId: string): Promise<ErpCredentials | null> {
  const { rows } = await dbQuery<CredRow>(
    `SELECT erp_api_url, erp_api_key, erp_api_key_enc, erp_connected FROM sellers WHERE id = $1`,
    [sellerId],
  );
  const r = rows[0];
  if (!r?.erp_connected || !r.erp_api_url) return null;
  if (r.erp_api_key_enc) return { url: r.erp_api_url, key: decryptErpKey(r.erp_api_key_enc) };
  if (r.erp_api_key) {
    await upgradePlaintextKey(sellerId, r.erp_api_key);
    return { url: r.erp_api_url, key: r.erp_api_key };
  }
  return null;
}

/** Salvează conexiunea ERP (URL deja validat anti-SSRF). */
export async function saveSellerErpConnection(sellerId: string, url: string, key: string): Promise<void> {
  await dbQuery(
    `UPDATE sellers
        SET erp_api_url = $1, erp_api_key = NULL, erp_api_key_hash = $2, erp_api_key_enc = $3,
            erp_connected = true, erp_last_sync = NOW()
      WHERE id = $4`,
    [url, hashErpKey(key), encryptErpKey(key), sellerId],
  );
}

export async function isErpKeyUsedByOtherSeller(sellerId: string, key: string): Promise<boolean> {
  const { rows } = await dbQuery<{ id: string }>(
    `SELECT id FROM sellers
      WHERE id <> $1 AND (erp_api_key_hash = $2 OR erp_api_key = $3)
      LIMIT 1`,
    [sellerId, hashErpKey(key), key],
  );
  return rows.length > 0;
}

export type PartnerSellerRow = { id: string; display_name: string | null };

/** Seller după cheia de partner (hash); rândurile vechi în clar sunt migrate la prima potrivire. */
export async function findSellerByPartnerKey(key: string): Promise<PartnerSellerRow | null> {
  const hash = hashErpKey(key);
  const { rows } = await dbQuery<PartnerSellerRow & { legacy: boolean }>(
    `SELECT id, name AS display_name, (erp_api_key_hash IS NULL) AS legacy
       FROM sellers
      WHERE erp_connected = true
        AND (erp_api_key_hash = $1 OR (erp_api_key_hash IS NULL AND erp_api_key = $2))
      LIMIT 1`,
    [hash, key],
  );
  const r = rows[0];
  if (!r) return null;
  if (r.legacy) await upgradePlaintextKey(r.id, key);
  return { id: r.id, display_name: r.display_name };
}
