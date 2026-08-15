/**
 * Database connection — pg Pool
 *
 * Uses standard pg.Pool for local/self-hosted PostgreSQL connectivity.
 */

import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  const isProd = process.env.NODE_ENV === "production";

  pool = new Pool({
    connectionString,
    max: isProd ? 15 : 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  // Prevent uncaughtException on FATAL 57P01 (admin shutdown) or idle client errors.
  pool.on("error", (err) => {
    console.warn("[db] idle pg client error:", err.message);
  });

  return pool;
}

export async function dbQuery<T = any>(text: string, params: unknown[] = []) {
  const result = await getPool().query(text, params);
  return result as { rows: T[]; rowCount: number };
}

export function getDb() {
  return getPool();
}

/**
 * Semnătura funcției de query primite în callback-ul `withTransaction`.
 * Exportată ca să poată fi tipizate funcțiile care participă la o tranzacție
 * deschisă de apelant (ex. `swypTransferInTx`).
 */
export type TxQuery = <R = any>(
  text: string,
  params?: unknown[],
) => Promise<{ rows: R[]; rowCount: number }>;

/**
 * Rulează un set de query-uri într-o singură tranzacție.
 * Commit automat la succes, ROLLBACK la orice excepție.
 *
 *   const order = await withTransaction(async (q) => {
 *     const { rows } = await q("INSERT INTO ... RETURNING id", [...]);
 *     await q("UPDATE ... WHERE id = $1", [rows[0].id]);
 *     return rows[0];
 *   });
 */
export async function withTransaction<T>(
  fn: (query: TxQuery) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const query = async <R = any>(text: string, params: unknown[] = []) => {
      const res = await client.query(text, params);
      return res as { rows: R[]; rowCount: number };
    };
    const result = await fn(query);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection may already be dead */
    }
    throw err;
  } finally {
    client.release();
  }
}
