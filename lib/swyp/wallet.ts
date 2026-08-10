/**
 * Portofel on-chain per utilizator (Swypik Chain, chainId 643366).
 *
 * Model custodial-cu-export: platforma generează și păstrează cheia privată
 * criptată (AES-256-GCM), ca userul obișnuit să nu trebuiască să înțeleagă
 * seed phrases. Oricine poate însă să-și EXPORTE cheia oricând — moment din
 * care are control criptografic real asupra fondurilor.
 *
 * Cheia de criptare vine din AUTH_SECRET (deja existent, rotabil). Nu stocăm
 * niciodată cheia privată în clar.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { dbQuery } from "@/lib/db";

const ALGO = "aes-256-gcm";

// 2026-08-10 (audit P1): salt fix pentru derivarea cheii — permite o migrare
// viitoare la scrypt/HKDF fără a schimba cheile deja criptate. Momentan
// păstrăm SHA-256 (deterministă, necesară pentru decriptarea cheilor existente),
// dar izolăm derivarea într-o funcție unică ca punct de schimbare.
const KEY_DERIVATION_LABEL = "swyp-wallet:";

function encryptionKey(): Buffer {
    const secret = process.env.SWYP_WALLET_KEY || process.env.AUTH_SECRET;
    if (!secret) throw new Error("SWYP_WALLET_KEY/AUTH_SECRET lipsește — nu pot cripta chei");
    // Derivare deterministă pe 32 bytes. NOTĂ: nu e KDF cu cost (scrypt/argon2)
    // pentru că trebuie să fie reproductibilă la decriptarea cheilor deja
    // stocate. Securitatea depinde de entropia AUTH_SECRET (≥32 bytes random),
    // nu de rezistența la brute-force pe parolă. Vezi audit P1.
    return createHash("sha256").update(`${KEY_DERIVATION_LABEL}${secret}`).digest();
}

function encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, encryptionKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

function decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(":");
    const decipher = createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export type ChainWallet = { address: string; createdAt: string; exportedAt: string | null };

/**
 * Returnează portofelul on-chain al userului, creându-l la prima cerere.
 * Idempotent: ON CONFLICT DO NOTHING + re-citire (dacă două cereri simultane
 * generează chei, una singură se salvează și ambele o folosesc pe aceea).
 */
export async function getOrCreateChainWallet(userId: string): Promise<ChainWallet> {
    const existing = await dbQuery<ChainWallet & { address: string }>(
        `SELECT address, created_at::text AS "createdAt", exported_at::text AS "exportedAt"
       FROM swyp_chain_wallets WHERE user_id = $1`,
        [userId],
    );
    if (existing.rows[0]) return existing.rows[0];

    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    await dbQuery(
        `INSERT INTO swyp_chain_wallets (user_id, address, enc_privkey)
     VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
        [userId, account.address, encrypt(pk)],
    );
    const { rows } = await dbQuery<ChainWallet>(
        `SELECT address, created_at::text AS "createdAt", exported_at::text AS "exportedAt"
       FROM swyp_chain_wallets WHERE user_id = $1`,
        [userId],
    );
    return rows[0];
}

/**
 * Exportă cheia privată în clar.
 *
 * ⚠️ NU expune această funcție într-un endpoint fără: (a) re-autentificare
 * (parolă sau 2FA), (b) rate limit foarte strict (≤1/oră), (c) log de
 * securitate. Cine obține valoarea returnată controlează definitiv fondurile
 * utilizatorului — nu există revocare pe blockchain.
 * În acest moment funcția NU e apelată din nicio rută (verificat la audit).
 */
export async function exportPrivateKey(userId: string): Promise<string | null> {
    const { rows } = await dbQuery<{ enc_privkey: string }>(
        `UPDATE swyp_chain_wallets SET exported_at = COALESCE(exported_at, now())
      WHERE user_id = $1 RETURNING enc_privkey`,
        [userId],
    );
    return rows[0] ? decrypt(rows[0].enc_privkey) : null;
}

/** Cheia privată pentru semnare server-side (bridge). Uz intern. */
export async function getPrivateKey(userId: string): Promise<string | null> {
    const { rows } = await dbQuery<{ enc_privkey: string }>(
        `SELECT enc_privkey FROM swyp_chain_wallets WHERE user_id = $1`,
        [userId],
    );
    return rows[0] ? decrypt(rows[0].enc_privkey) : null;
}
