/**
 * Swypik Cares — donații.
 *
 * POST /api/donations — creează o donație (pending până la confirmarea plății).
 *   Fără procesator de plăți configurat încă → donația rămâne `pending`
 *   și e confirmată de webhook-ul de plată când Stripe/Netopia e activ.
 *
 * Anti-abuz: rate limit pe IP + sume rezonabile + campanie activă verificată.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { dbQuery, withTransaction } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { DonationCreateSchema, parseBody } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ipHash(req: Request): string {
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function POST(req: Request) {
  try {
    const hash = ipHash(req);
    const rl = await rateLimit("donations", hash);
    if (!rl.success) {
      return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = parseBody(DonationCreateSchema, raw);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const d = parsed.data;

    const session = await getAuthSession();
    const userId = session?.userId ?? null;

    // Campania trebuie activă și beneficiarul verificat.
    const { rows: campaigns } = await dbQuery(
      `SELECT c.id, c.status, c.currency, dc.verification_status
         FROM donation_campaigns c
         JOIN donation_causes dc ON dc.id = c.cause_id
        WHERE c.id = $1`,
      [d.campaign_id],
    );
    const campaign = campaigns[0];
    if (!campaign || campaign.status !== "active" || campaign.verification_status !== "verified") {
      return NextResponse.json({ success: false, error: "Campania nu acceptă donații." }, { status: 409 });
    }

    const donation = await withTransaction(async (q) => {
      const { rows } = await q(
        `INSERT INTO donations (
           campaign_id, donor_user_id, donor_name, donor_email,
           amount_cents, currency, message, is_anonymous, source, ip_hash
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, amount_cents, currency, payment_status`,
        [
          d.campaign_id,
          userId,
          d.is_anonymous ? null : d.donor_name ?? null,
          d.donor_email ?? null,
          Math.round(d.amount * 100),
          campaign.currency,
          d.message ?? null,
          d.is_anonymous ?? false,
          d.source ?? "direct",
          hash,
        ],
      );
      return rows[0];
    });

    // Fără procesator încă: răspundem cu pending + instrucțiuni.
    // Când Stripe e configurat, aici se creează PaymentIntent.
    return NextResponse.json({
      success: true,
      donation,
      payment: {
        status: "pending",
        note: "Plățile online se activează în curând. Donația a fost înregistrată.",
      },
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "[donations] POST error");
    return NextResponse.json({ success: false, error: "Eroare la înregistrarea donației." }, { status: 500 });
  }
}
