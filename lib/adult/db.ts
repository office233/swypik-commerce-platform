/**
 * Swypik 18+ database pool — physically isolated from the marketplace DB.
 *
 * NEVER import `dbQuery` from `@/lib/db` in any /adult/* code path.
 * NEVER join across DBs at the SQL layer. User linkage is done in
 * application code via `user_id` only (see `userMirror.ts`).
 *
 * Required env: DATABASE_URL_ADULT (postgres://swypik_adult_app:...@host:5432/swypik_adult)
 */

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const cs = process.env.DATABASE_URL_ADULT;

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  if (!cs) {
    throw new Error(
      "DATABASE_URL_ADULT is not set. The Swypik 18+ subsystem requires its own database.",
    );
  }
  pool = new Pool({
    connectionString: cs,
    max: Number(process.env.ADULT_DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", (err) => {
    console.warn("[adult-db] idle client error:", err.message);
  });
  return pool;
}

export const adultDb = new Proxy({} as Pool, {
  get(_t, prop) {
    const p = getPool() as unknown as Record<string | symbol, unknown>;
    const v = p[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(p) : v;
  },
});

export async function adultQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[]);
}

export async function adultTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* noop */
    }
    throw err;
  } finally {
    client.release();
  }
}
