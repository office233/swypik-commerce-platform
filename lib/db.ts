/**
 * Database connection — @neondatabase/serverless Pool
 * 
 * Uses Neon's serverless-compatible Pool (drop-in replacement for pg.Pool).
 * Unlike pg.Pool, this uses WebSocket/HTTP under the hood — no persistent
 * TCP connections needed, works perfectly in Vercel serverless functions.
 * 
 * Benefits over raw pg.Pool:
 * - No cold-start TCP connection overhead
 * - Automatic WebSocket multiplexing
 * - Works with Vercel Edge Runtime
 */

import { Pool } from "@neondatabase/serverless";

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
