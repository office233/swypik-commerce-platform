/**
 * Ciclul de viață al joburilor de dispatch + igiena curierilor online.
 *
 * Audit courier-fleet (P0, 2026-09): jobul unei livrări Food nu era eliberat
 * niciodată (rămânea 'assigned'), deci curierul era blocat după prima livrare;
 * curierii suspendați primeau oferte; curierii fără heartbeat rămâneau online.
 */
import { dbQuery, type TxQuery } from "@/lib/db";
import { COURIER_STALE_SECONDS } from "./constants";

export type JobOutcome = "completed" | "cancelled";

/** SQL: curier eligibil pentru oferte (activ + heartbeat proaspăt). Alias `c`. */
export const COURIER_AVAILABLE_SQL =
  `(c.active AND COALESCE(COALESCE(c.last_heartbeat_at, c.location_updated_at) > ` +
  `now() - make_interval(secs => ${COURIER_STALE_SECONDS}), false))`;

async function releaseJobs(q: TxQuery, column: "order_id" | "ride_id", id: string, outcome: JobOutcome): Promise<string[]> {
  const { rows } = await q<{ id: string }>(
    `UPDATE dispatch_jobs SET status = $2, updated_at = now()
      WHERE ${column} = $1 AND status IN ('searching', 'assigned')
      RETURNING id`,
    [id, outcome],
  );
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await q(
      `UPDATE dispatch_offers SET response = 'expired', responded_at = now()
        WHERE job_id = ANY($1::uuid[]) AND response IS NULL`,
      [ids],
    );
  }
  return ids;
}

/** Eliberează jobul activ al unei comenzi (livrată → completed, anulată/refuzată → cancelled). */
export function releaseJobForOrder(q: TxQuery, orderId: string, outcome: JobOutcome): Promise<string[]> {
  return releaseJobs(q, "order_id", orderId, outcome);
}

/** Eliberează jobul activ al unei curse. */
export function releaseJobForRide(q: TxQuery, rideId: string, outcome: JobOutcome): Promise<string[]> {
  return releaseJobs(q, "ride_id", rideId, outcome);
}

/**
 * Pune offline curierii suspendați sau fără heartbeat recent și expiră
 * ofertele lor pending. Rulat din tick-ul de dispatch (cron).
 */
export async function sweepStaleCouriers(): Promise<number> {
  const { rows } = await dbQuery<{ id: string }>(
    `UPDATE couriers c SET is_online = false, updated_at = now()
      WHERE c.is_online
        AND NOT ${COURIER_AVAILABLE_SQL}
      RETURNING c.id`,
  );
  if (rows.length) {
    await dbQuery(
      `UPDATE dispatch_offers SET response = 'expired', responded_at = now()
        WHERE courier_id = ANY($1::uuid[]) AND response IS NULL`,
      [rows.map((r) => r.id)],
    );
  }
  return rows.length;
}
