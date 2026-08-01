/**
 * GET /api/swyp/wallet — soldul SWYP + istoricul din ledger (paginat).
 * Query: ?limit=20&before=<ledger id>
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { getSwypBalanceUnits } from "@/lib/swyp/ledger";
import { treasuryAddress } from "@/lib/swyp/chain";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const before = url.searchParams.get("before");

  const [balance, history] = await Promise.all([
    getSwypBalanceUnits(session.userId),
    dbQuery<{
      id: string; direction: string; amount_units: string; kind: string;
      ref_type: string; description: string | null; created_at: string;
    }>(
      `SELECT id::text,
              CASE WHEN to_user_id = $1 THEN 'in' ELSE 'out' END AS direction,
              amount_units::text, kind, ref_type, description, created_at::text
         FROM swyp_ledger_entries
        WHERE (to_user_id = $1 OR from_user_id = $1)
          AND ($2::bigint IS NULL OR id < $2::bigint)
        ORDER BY id DESC
        LIMIT $3`,
      [session.userId, before ? Number(before) : null, limit],
    ),
  ]);

  return NextResponse.json({
    success: true,
    balanceUnits: balance.toString(),
    // 1 SWYP = 100 units
    balanceSwyp: (Number(balance) / 100).toFixed(2),
    // adresa de depozit chain→app (trezoreria REWARDS); scanner-ul creditează automat
    depositAddress: (() => { try { return treasuryAddress(); } catch { return null; } })(),
    history: history.rows,
    nextCursor: history.rows.length === limit ? history.rows[history.rows.length - 1].id : null,
  });
});
