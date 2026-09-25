/**
 * FRONT R5 — Admin: aprobare/respingere cereri de payout curieri.
 *
 * GET  /api/admin/courier-payouts?status=pending — listă
 * POST /api/admin/courier-payouts { id, action: 'paid'|'rejected', note? }
 *   'paid'     → marchează plătită (transferul bancar se face manual deocamdată)
 *   'rejected' → recreditează suma în wallet (ref 'payout_refund:{id}')
 *
 * Client-facing `error` values are stable codes (never Romanian sentences) —
 * the admin UI (courier-payouts/page.tsx) translates them for display.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbQuery } from "@/lib/db";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { creditUser } from "@/lib/wallet/ledger";
import { logAdminAction } from "@/lib/security/admin-audit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "admin/courier-payouts" });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PostSchema = z.object({
  id: z.string().regex(UUID_RE),
  action: z.enum(["paid", "rejected"]),
  note: z.string().max(500).optional().nullable(),
});

type PayoutRow = {
  id: string;
  user_id: string;
  amount_cents: string;
  status: string;
};

export async function GET(req: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const params: unknown[] = [];
  // Doar cererile curierilor; cele ale creatorilor au coada lor (/api/admin/creator-payouts).
  let where = "WHERE pr.kind = 'courier'";
  if (status && ["pending", "paid", "rejected"].includes(status)) {
    params.push(status);
    where += " AND pr.status = $1";
  }
  try {
    const { rows } = await dbQuery(
      `SELECT pr.id, pr.user_id, pr.amount_cents::int8 AS amount_cents, pr.currency,
              pr.status, pr.iban, pr.admin_note, pr.requested_at, pr.resolved_at,
              u.email, u.display_name,
              COALESCE(wb.balance_cents, 0)::int8 AS balance_cents
         FROM payout_requests pr
         JOIN users u ON u.id = pr.user_id
         LEFT JOIN wallet_balances wb ON wb.user_id = pr.user_id
         ${where}
        ORDER BY pr.requested_at DESC
        LIMIT 200`,
      params,
    );
    return NextResponse.json({ payouts: rows });
  } catch (err) {
    log.error({ err }, "failed to list courier payouts");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }
  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { id, action, note } = parsed.data;

  try {
    const { rows } = await dbQuery<PayoutRow>(
      `UPDATE payout_requests
          SET status = $2, admin_note = $3, resolved_at = now(), resolved_by = 'admin'
        WHERE id = $1 AND status = 'pending' AND kind = 'courier'
        RETURNING id, user_id, amount_cents::text, status`,
      [id, action, note ?? null],
    );
    const pr = rows[0];
    if (!pr) {
      return NextResponse.json({ error: "payout_not_pending" }, { status: 409 });
    }

    if (action === "rejected") {
      // Banii debitați la cerere se întorc în wallet.
      try {
        await creditUser({
          userId: pr.user_id,
          amountCents: Number(pr.amount_cents),
          refType: "payout_refund",
          refId: pr.id,
          description: "Retragere respinsă — sumă returnată în sold",
        });
      } catch (err) {
        log.error({ err, payoutId: pr.id }, "payout refund credit failed");
        return NextResponse.json({ error: "refund_failed" }, { status: 500 });
      }
    }

    await logAdminAction({
      action: action === "paid" ? "courier_payout.mark_paid" : "courier_payout.reject",
      targetType: "payout_request",
      targetId: pr.id,
      details: { note: note ?? null },
      req,
    });

    log.info({ payoutId: pr.id, action }, "courier payout resolved");
    return NextResponse.json({ success: true, id: pr.id, status: action });
  } catch (err) {
    log.error({ err, id, action }, "failed to resolve courier payout");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
