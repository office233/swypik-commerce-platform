/**
 * FRONT R5 — Admin: aprobare/respingere cereri de payout curieri.
 *
 * GET  /api/admin/courier-payouts?status=pending — listă
 * POST /api/admin/courier-payouts { id, action: 'paid'|'rejected', note? }
 *   'paid'     → marchează plătită (transferul bancar se face manual deocamdată)
 *   'rejected' → recreditează suma în wallet (ref 'payout_refund:{id}')
 */
import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { creditUser } from "@/lib/wallet/ledger";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "admin/courier-payouts" });

export async function GET(req: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const params: unknown[] = [];
  let where = "";
  if (status && ["pending", "paid", "rejected"].includes(status)) {
    params.push(status);
    where = "WHERE pr.status = $1";
  }
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
}

export async function POST(req: Request) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const { id, action, note } = body ?? {};
  if (!id || (action !== "paid" && action !== "rejected")) {
    return NextResponse.json({ error: "id + action ('paid'|'rejected') necesare." }, { status: 400 });
  }

  const { rows } = await dbQuery<{ id: string; user_id: string; amount_cents: string; status: string }>(
    `UPDATE payout_requests
        SET status = $2, admin_note = $3, resolved_at = now(), resolved_by = 'admin'
      WHERE id = $1 AND status = 'pending'
      RETURNING id, user_id, amount_cents::text, status`,
    [id, action, note ?? null],
  );
  const pr = rows[0];
  if (!pr) {
    return NextResponse.json({ error: "Cererea nu există sau nu mai e pending." }, { status: 409 });
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
      return NextResponse.json({ error: "Refund în wallet a eșuat — verifică manual." }, { status: 500 });
    }
  }

  log.info({ payoutId: pr.id, action }, "courier payout resolved");
  return NextResponse.json({ success: true, id: pr.id, status: action });
}
