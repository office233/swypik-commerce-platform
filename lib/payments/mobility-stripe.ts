/**
 * FRONT R5 — Stripe pentru curse (Swypik Go).
 *
 *  - authorizeRidePayment: PaymentIntent cu capture manual (pre-autorizare)
 *    pe tariful estimat +20% buffer (tariful final poate crește pe traseu).
 *  - captureRidePayment: la 'completed', capture pe final_fare_cents + tip
 *    (max. suma autorizată — Stripe nu permite capture peste autorizare).
 *  - cancelRideAuthorization: la 'cancelled' eliberează pre-autorizarea.
 *
 * Idempotent: idempotencyKey Stripe = ride:{id}:authorize / :capture, iar
 * starea locală (rides.payment_status) e verificată înainte de fiecare pas.
 */
import { getStripe } from "@/lib/stripe/checkout";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger.child({ mod: "payments/mobility-stripe" });

/** buffer de pre-autorizare peste estimare (tariful final poate fi mai mare) */
const AUTH_BUFFER_PCT = 20;

type RidePayRow = {
  id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_intent_id: string | null;
  estimated_fare_cents: number | null;
  final_fare_cents: number | null;
  tip_cents: number;
  currency: string;
  rider_user_id: string;
};

async function loadRidePay(rideId: string): Promise<RidePayRow | null> {
  const { rows } = await dbQuery<RidePayRow>(
    `SELECT id, status, payment_method, payment_status, payment_intent_id,
            estimated_fare_cents, final_fare_cents, COALESCE(tip_cents,0)::int AS tip_cents,
            trim(currency) AS currency, rider_user_id
       FROM rides WHERE id = $1`,
    [rideId],
  );
  return rows[0] ?? null;
}

/**
 * Creează (sau refolosește) pre-autorizarea. Returnează client_secret pentru
 * confirmarea plății în frontend (Stripe Elements / Payment Sheet).
 */
export async function authorizeRidePayment(rideId: string): Promise<{
  payment_intent_id: string;
  client_secret: string | null;
  amount_cents: number;
} | null> {
  const ride = await loadRidePay(rideId);
  if (!ride) return null;
  if (ride.payment_method !== "card") throw new Error("Cursa nu e cu plata card.");

  const stripe = getStripe();

  // Refolosește PI existent dacă e încă utilizabil.
  if (ride.payment_intent_id) {
    const pi = await stripe.paymentIntents.retrieve(ride.payment_intent_id);
    if (["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture", "processing"].includes(pi.status)) {
      return { payment_intent_id: pi.id, client_secret: pi.client_secret, amount_cents: pi.amount };
    }
  }

  const base = ride.estimated_fare_cents ?? 0;
  if (base <= 0) throw new Error("Cursa nu are tarif estimat.");
  const amount = Math.round(base * (1 + AUTH_BUFFER_PCT / 100)) + ride.tip_cents;

  const pi = await stripe.paymentIntents.create(
    {
      amount,
      currency: (ride.currency || "ron").toLowerCase(),
      capture_method: "manual",
      metadata: { kind: "ride", ride_id: ride.id, rider_user_id: ride.rider_user_id },
      description: `Swypik Go ride ${ride.id}`,
    },
    { idempotencyKey: `ride:${ride.id}:authorize` },
  );

  await dbQuery(
    `UPDATE rides SET payment_intent_id = $2, payment_status = 'authorized', updated_at = now()
      WHERE id = $1`,
    [ride.id, pi.id],
  );
  log.info({ rideId, pi: pi.id, amount }, "ride payment authorized (PI created)");
  return { payment_intent_id: pi.id, client_secret: pi.client_secret, amount_cents: amount };
}

/**
 * Capture la completed: final_fare + tip, plafonat la suma autorizată.
 * Idempotent — dacă PI e deja succeeded, e no-op.
 */
export async function captureRidePayment(rideId: string): Promise<{ captured_cents: number } | null> {
  const ride = await loadRidePay(rideId);
  if (!ride || ride.payment_method !== "card" || !ride.payment_intent_id) return null;
  if (ride.payment_status === "captured") return { captured_cents: ride.final_fare_cents ?? 0 };

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(ride.payment_intent_id);

  if (pi.status === "succeeded") {
    await dbQuery(`UPDATE rides SET payment_status = 'captured', updated_at = now() WHERE id = $1`, [rideId]);
    return { captured_cents: pi.amount_received };
  }
  if (pi.status !== "requires_capture") {
    log.warn({ rideId, piStatus: pi.status }, "capture skipped — PI not capturable");
    await dbQuery(`UPDATE rides SET payment_status = 'failed', updated_at = now() WHERE id = $1`, [rideId]);
    return null;
  }

  const wanted = (ride.final_fare_cents ?? ride.estimated_fare_cents ?? 0) + ride.tip_cents;
  const toCapture = Math.min(Math.max(wanted, 1), pi.amount);

  const captured = await stripe.paymentIntents.capture(
    pi.id,
    { amount_to_capture: toCapture },
    { idempotencyKey: `ride:${ride.id}:capture` },
  );

  await dbQuery(`UPDATE rides SET payment_status = 'captured', updated_at = now() WHERE id = $1`, [rideId]);
  log.info({ rideId, captured: captured.amount_received }, "ride payment captured");
  return { captured_cents: captured.amount_received ?? toCapture };
}

/** Eliberează pre-autorizarea la anulare (no-op dacă nu există PI activ). */
export async function cancelRideAuthorization(rideId: string): Promise<void> {
  const ride = await loadRidePay(rideId);
  if (!ride?.payment_intent_id || ride.payment_status !== "authorized") return;
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.cancel(ride.payment_intent_id, undefined, {
      idempotencyKey: `ride:${ride.id}:cancel`,
    });
    await dbQuery(`UPDATE rides SET payment_status = 'unpaid', updated_at = now() WHERE id = $1`, [rideId]);
  } catch (err) {
    log.warn({ rideId, err }, "cancel authorization failed (may already be canceled)");
  }
}
