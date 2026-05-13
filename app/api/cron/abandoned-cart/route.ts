/**
 * Cron Job: Abandoned Cart Recovery Emails
 *
 * Queries checkout_sessions where:
 *   - status != 'completed'
 *   - created_at is between 2h and 48h ago
 *   - metadata->>'recovery_email_sent' IS NULL
 *
 * For each match, sends a branded recovery email and flags the session
 * so it is never re-sent.
 *
 * Auth: CRON_SECRET (Bearer token, header, or query param).
 */

import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import {
  sendAbandonedCartEmail,
  type AbandonedCartItem,
} from "@/lib/email/service";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  /* ── 1. Authorization ───────────────────────────────────── */
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    req.headers.get("CRON_SECRET");

  const expected = process.env.CRON_SECRET;
  if (!expected || !token ||
      Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://swypik.com";

  try {
    /* ── 2. Query abandoned sessions ──────────────────────── */
    const { rows: abandonedSessions } = await dbQuery(
      `SELECT
         id,
         provider_session_id,
         metadata,
         created_at
       FROM checkout_sessions
       WHERE status != 'completed'
         AND created_at >= NOW() - INTERVAL '48 hours'
         AND created_at <= NOW() - INTERVAL '2 hours'
         AND (metadata->>'recovery_email_sent') IS NULL`
    );

    console.log(
      `[Abandoned Cart Cron] Found ${abandonedSessions.length} abandoned session(s)`
    );

    let sent = 0;
    let skipped = 0;

    /* ── 3. Process each session ──────────────────────────── */
    for (const session of abandonedSessions) {
      const meta =
        typeof session.metadata === "string"
          ? JSON.parse(session.metadata)
          : session.metadata;

      // Extract customer email
      const customerEmail: string | undefined =
        meta?.customer_email || meta?.email;

      if (!customerEmail || !customerEmail.includes("@")) {
        console.warn(
          `[Abandoned Cart] Skipping session ${session.id} — no valid email`
        );
        skipped++;
        continue;
      }

      // Extract cart items from metadata
      const rawItems: any[] = meta?.items || [];
      if (rawItems.length === 0) {
        console.warn(
          `[Abandoned Cart] Skipping session ${session.id} — no items in metadata`
        );
        skipped++;
        continue;
      }

      const cartItems: AbandonedCartItem[] = rawItems.map((item: any) => ({
        title: item.title || "Produs",
        price:
          item.unit_amount_cents != null
            ? Number(item.unit_amount_cents) / 100
            : Number(item.price) || 0,
        image: item.image || undefined,
        quantity: item.quantity || 1,
      }));

      // Build a checkout URL the customer can resume from
      const checkoutUrl = `${appUrl}/checkout?recover=${session.provider_session_id || session.id}`;

      try {
        const ok = await sendAbandonedCartEmail(
          customerEmail,
          cartItems,
          checkoutUrl,
        );

        if (ok) {
          // Mark session so we never re-send
          await dbQuery(
            `UPDATE checkout_sessions
             SET metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{recovery_email_sent}',
               $1::jsonb
             )
             WHERE id = $2`,
            [JSON.stringify(true), session.id],
          );
          sent++;
          console.log(
            `[Abandoned Cart] ✅ Recovery email sent → ${customerEmail} (session ${session.id})`
          );
        } else {
          skipped++;
          console.warn(
            `[Abandoned Cart] ⚠️ Email send returned false for ${customerEmail}`
          );
        }
      } catch (emailErr: any) {
        skipped++;
        console.error(
          `[Abandoned Cart] ❌ Failed to send to ${customerEmail}:`,
          emailErr.message,
        );
      }
    }

    console.log(
      `[Abandoned Cart Cron] Done — sent: ${sent}, skipped: ${skipped}`
    );

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      total: abandonedSessions.length,
    });
  } catch (error: any) {
    console.error("[Abandoned Cart Cron Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export const POST = GET;
