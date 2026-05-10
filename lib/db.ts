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

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
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
