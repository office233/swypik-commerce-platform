/**
 * Stripe Identity webhook
 *
 * Handles `identity.verification_session.*` events:
 *   - verified         → mark user approved if age >= 18
 *   - requires_input   → keep pending, store rejection reason
 *   - canceled         → mark expired
 *
 * Requires env STRIPE_IDENTITY_WEBHOOK_SECRET (separate from the checkout secret
 * because Stripe issues distinct signing keys per webhook endpoint).
 */
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/checkout";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "stripe-identity-webhook" });

export const dynamic = "force-dynamic";

const MIN_AGE = 18;

async function getRawBody(req: Request): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = req.body?.getReader();
  if (!reader) throw new Error("No body");
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function ageFromDob(dob: { day: number | null; month: number | null; year: number | null } | null | undefined): number | null {
  if (!dob?.year || !dob?.month || !dob?.day) return null;
  const birth = new Date(Date.UTC(dob.year, dob.month - 1, dob.day));
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function dobToIso(dob: { day: number | null; month: number | null; year: number | null }): string | null {
  if (!dob.year || !dob.month || !dob.day) return null;
  return `${dob.year.toString().padStart(4, "0")}-${dob.month.toString().padStart(2, "0")}-${dob.day.toString().padStart(2, "0")}`;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
  if (!secret) {
    log.error("STRIPE_IDENTITY_WEBHOOK_SECRET missing");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await getRawBody(req);
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    log.error({ err }, "signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type.startsWith("identity.verification_session.")) {
      const verification = event.data.object as Stripe.Identity.VerificationSession;
      const userId = verification.metadata?.user_id;
      if (!userId) {
        log.warn({ verification_id: verification.id }, "event without user_id metadata");
        return NextResponse.json({ received: true, skipped: "no user_id" });
      }

      switch (event.type) {
        case "identity.verification_session.verified": {
          // Pull verified outputs (PII) — requires explicit retrieve with expand
          const full = await getStripe().identity.verificationSessions.retrieve(
            verification.id,
            { expand: ["verified_outputs"] }
          );
          const dob = full.verified_outputs?.dob ?? null;
          const country = full.verified_outputs?.address?.country ?? null;
          const age = ageFromDob(dob);

          if (age === null || age < MIN_AGE) {
            await dbQuery(
              `UPDATE user_age_verifications
                  SET status = 'rejected',
                      rejection_reason = $2,
                      verified_at = now()
                WHERE user_id = $1`,
              [userId, age === null ? "no_dob" : `under_${MIN_AGE}`]
            );
            await dbQuery(
              `UPDATE users SET age_verification_status = 'rejected' WHERE id = $1`,
              [userId]
            );
            break;
          }

          await dbQuery(
            `UPDATE user_age_verifications
                SET status = 'approved',
                    verified_at = now(),
                    document_country = $2,
                    date_of_birth = $3
              WHERE user_id = $1`,
            [userId, country, dob ? dobToIso(dob) : null]
          );
          await dbQuery(
            `UPDATE users
                SET age_verification_status = 'approved',
                    age_verified_at = now(),
                    birth_date = COALESCE(birth_date, $2)
              WHERE id = $1`,
            [userId, dob ? dobToIso(dob) : null]
          );
          break;
        }

        case "identity.verification_session.requires_input": {
          const reason = verification.last_error?.reason || verification.last_error?.code || "requires_input";
          await dbQuery(
            `UPDATE user_age_verifications
                SET status = 'pending',
                    rejection_reason = $2
              WHERE user_id = $1`,
            [userId, reason]
          );
          break;
        }

        case "identity.verification_session.canceled": {
          await dbQuery(
            `UPDATE user_age_verifications
                SET status = 'expired'
              WHERE user_id = $1`,
            [userId]
          );
          await dbQuery(
            `UPDATE users SET age_verification_status = 'expired' WHERE id = $1 AND age_verification_status = 'pending'`,
            [userId]
          );
          break;
        }

        default:
          // ignore other identity events for now (created, processing, ...)
          break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    log.error({ err }, "handler error");
    const message = err instanceof Error ? err.message : "Handler error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
