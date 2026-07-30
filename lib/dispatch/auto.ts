/**
 * Auto-dispatch — pornește automat căutarea curierului în funcție de setarea
 * merchantului `local_merchants.auto_dispatch_on`:
 *   'placed' — imediat după plasarea comenzii
 *   'ready'  — când comanda trece în status 'ready' (default)
 *   'manual' — niciodată automat (merchantul apasă butonul din dashboard)
 *
 * Best-effort: eșecurile sunt logate, nu propagate (nu blocăm comanda).
 */
import { dbQuery } from "@/lib/db";
import { createJob } from "@/lib/dispatch/engine";
import { logger } from "@/lib/logger";

export type AutoDispatchTrigger = "placed" | "ready";

export async function maybeAutoDispatch(
  orderId: string,
  trigger: AutoDispatchTrigger,
): Promise<boolean> {
  try {
    const { rows } = await dbQuery<{
      dispatch_status: string;
      courier_id: string | null;
      auto_dispatch_on: string;
      location_city: string | null;
      location_lat: number | null;
      location_lng: number | null;
    }>(
      `SELECT lo.dispatch_status, lo.courier_id,
              m.auto_dispatch_on, m.location_city, m.location_lat, m.location_lng
         FROM local_orders lo
         JOIN local_merchants m ON m.id = lo.merchant_id
        WHERE lo.id = $1`,
      [orderId],
    );
    const row = rows[0];
    if (!row) return false;
    if (row.auto_dispatch_on !== trigger) return false;
    if (row.courier_id || row.dispatch_status !== "none") return false;
    if (!row.location_city) return false;

    await createJob({
      kind: "delivery",
      orderId,
      city: row.location_city,
      pickupLat: row.location_lat,
      pickupLng: row.location_lng,
    });
    logger.info({ orderId, trigger }, "[dispatch] auto-dispatch started");
    return true;
  } catch (err) {
    logger.error({ err, orderId, trigger }, "[dispatch] auto-dispatch failed");
    return false;
  }
}
