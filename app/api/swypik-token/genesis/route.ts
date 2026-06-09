import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

type GenesisRow = {
  label: string;
  address: string;
  balance: string;
  percent: string;
};

/**
 * Public genesis allocation snapshot.
 * Reads live from swypik_token_balances + swypik_addresses. Excludes
 * primary user wallets (label='Primary') so only protocol allocation
 * lines are surfaced. Edge-cached 10 minutes — balances move slowly
 * since 100% of supply was minted at genesis and only Mining Rewards
 * Pool drains (gradually).
 */
export async function GET() {
  const sql = `
    SELECT a.label, a.address, b.balance::text AS balance
    FROM swypik_token_balances b
    JOIN swypik_addresses a ON a.address = b.address
    WHERE a.label <> 'Primary'
    ORDER BY b.balance::numeric DESC, a.label ASC
  `;
  let rows: { label: string; address: string; balance: string }[] = [];
  try {
    const { rows: r } = await dbQuery(sql);
    rows = r;
  } catch (err) {
    return NextResponse.json({ error: "db_error", message: (err as Error).message }, { status: 500 });
  }

  const HARD_CAP = 21_000_000;
  const items: GenesisRow[] = rows.map((r) => ({
    label: r.label,
    address: r.address,
    balance: r.balance,
    percent: ((Number(r.balance) / HARD_CAP) * 100).toFixed(2),
  }));

  return NextResponse.json(
    {
      hard_cap: String(HARD_CAP),
      genesis: items,
      sealed_at: "2026-06-01T00:00:00Z",
      chain_id: "swypik-mainnet-1",
    },
    {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    },
  );
}
