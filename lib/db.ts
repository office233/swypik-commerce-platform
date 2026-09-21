/**
 * Database connection — pg Pool
 *
 * Uses standard pg.Pool for local/self-hosted PostgreSQL connectivity.
 */

import { Pool } from "pg";
import { logger } from "@/lib/logger";

let pool: Pool | null = null;

/**
 * Plafon de durată per interogare (2026-08-24, audit perf).
 *
 * Fără el, o singură interogare degradată (mat view nerefreshat, plan schimbat
 * după creșterea `feed_events`, autovacuum) putea ocupa o conexiune pe termen
 * nedefinit; cu pool-ul epuizat, cădeau în cascadă și checkout-ul, și
 * autentificarea.
 *
 * Valoarea implicită e deliberat generoasă: scopul e să nu existe blocaje
 * INFINITE, nu să taie interogări lente legitime. Se coboară după ce ai măsurat
 * latențele reale în producție, prin `PG_STATEMENT_TIMEOUT_MS`.
 * Dacă apar 500-uri pe feed imediat după deploy, aici se ridică.
 */
const STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS) > 0
  ? Math.trunc(Number(process.env.PG_STATEMENT_TIMEOUT_MS))
  : 30_000;

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
    statement_timeout: STATEMENT_TIMEOUT_MS,
    // O tranzacție uitată deschisă ține și conexiunea, și locks-urile.
    idle_in_transaction_session_timeout: 30_000,
  });

  // Prevent uncaughtException on FATAL 57P01 (admin shutdown) or idle client errors.
  pool.on("error", (err) => {
    logger.warn({ err }, "[db] idle pg client error");
  });

  return pool;
}

export async function dbQuery<T = any>(text: string, params: unknown[] = []) {
  const result = await getPool().query(text, params);
  return result as { rows: T[]; rowCount: number };
}

/**
 * Interogare de mentenanță (REFRESH MATERIALIZED VIEW, backfill, reconciliere):
 * ridică plafonul `statement_timeout` doar pentru conexiunea aceasta. Plafonul
 * implicit al pool-ului e dimensionat pentru cererile utilizatorilor și ar
 * întrerupe legitim o astfel de operație.
 */
export async function dbQueryLong<T = any>(
  text: string,
  params: unknown[] = [],
  timeoutMs = 300_000,
) {
  const client = await getPool().connect();
  try {
    await client.query(`SET statement_timeout = ${Math.trunc(timeoutMs)}`);
    const result = await client.query(text, params);
    return result as { rows: T[]; rowCount: number };
  } finally {
    // Conexiunea se întoarce în pool — plafonul ridicat NU are voie să o urmeze.
    // Restaurăm valoarea explicit, nu prin `DEFAULT`: `DEFAULT` revine la
    // valoarea serverului (tipic 0 = nelimitat), nu la cea configurată de pool,
    // deci ar strecura înapoi în pool o conexiune fără plafon.
    await client
      .query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
      .catch(() => undefined);
    client.release();
  }
}

export function getDb() {
  return getPool();
}

/**
 * Rulează `fn` ținând un lock advisory Postgres pe `key` — serializează căile
 * concurente care ating aceeași resursă logică (ex. recreditarea SWYP a
 * aceleiași comenzi din cron ȘI din webhook, care altfel fac ambele
 * check-then-act și creditează de două ori).
 *
 * Lock la nivel de SESIUNE (o conexiune dedicată ținută pe toată durata `fn`),
 * nu de tranzacție — `fn` face mai multe query-uri pe pool, fiecare pe altă
 * conexiune, deci un lock legat de o singură tranzacție nu i-ar acoperi.
 * `pg_advisory_lock`/`unlock` cu aceeași cheie pe conexiunea rezervată.
 */
export async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  // Cheie stabilă pe 63 biți din `key` (hashtext dă int4; îl folosim ca lock-id).
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
  } catch (err) {
    // Dacă nu putem lua lock-ul, e mai sigur să NU rulăm o operație pe bani
    // fără protecție decât să riscăm dubla execuție.
    client.release();
    throw err;
  }
  try {
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]).catch(() => undefined);
    client.release();
  }
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
