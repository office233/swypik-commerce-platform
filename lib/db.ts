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
