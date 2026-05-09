import { Pool } from "@neondatabase/serverless";

let pool: Pool | null = null;

export function getDb() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  pool = new Pool({
    connectionString,
  });

  return pool;
}

export async function dbQuery<T = any>(text: string, params: unknown[] = []) {
  const result = await getDb().query<T>(text, params);
  return result;
}
