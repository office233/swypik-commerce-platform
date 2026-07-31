/**
 * GET /api/swyp/supply — transparență publică (fără auth).
 *
 * Expune supply-ul fix, distribuția pe pool-uri, cât e în mâinile userilor,
 * rata curentă de emisie și starea invariantului. Diferențiatorul față de
 * proiectele care nu publică nimic verificabil.
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { dbQuery } from "@/lib/db";
import { verifySupplyInvariant } from "@/lib/swyp/ledger";
import { getHalvingFactor } from "@/lib/swyp/mining";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = withErrorHandling(async () => {
  const [pools, circulating, entries, invariantDiff, halving, cfg] = await Promise.all([
    dbQuery<{ pool: string; balance_units: string; genesis_units: string }>(
      `SELECT pool, balance_units::text, genesis_units::text FROM swyp_treasury_pools ORDER BY pool`,
    ),
    dbQuery<{ total: string; holders: string }>(
      `SELECT COALESCE(SUM(balance_units), 0)::text AS total,
              COUNT(*) FILTER (WHERE balance_units > 0)::text AS holders
         FROM swyp_balances`,
    ),
    dbQuery<{ c: string; last_hash: string | null }>(
      `SELECT COUNT(*)::text AS c,
              (SELECT entry_hash FROM swyp_ledger_entries ORDER BY id DESC LIMIT 1) AS last_hash
         FROM swyp_ledger_entries`,
    ),
    verifySupplyInvariant(),
    getHalvingFactor(),
    dbQuery<{ value: string }>(`SELECT value::text AS value FROM swyp_config WHERE key = 'total_supply_units'`),
  ]);

  const toSwyp = (units: string) => (Number(units) / 100).toString();

  return NextResponse.json({
    success: true,
    totalSupplySwyp: toSwyp(cfg.rows[0]?.value ?? "0"),
    circulatingSwyp: toSwyp(circulating.rows[0].total),
    holders: Number(circulating.rows[0].holders),
    treasury: pools.rows.map((p) => ({
      pool: p.pool,
      balanceSwyp: toSwyp(p.balance_units),
      genesisSwyp: toSwyp(p.genesis_units),
    })),
    emission: {
      networkUsers: halving.users,
      halvings: halving.halvings,
      rateFactor: halving.factor,
    },
    ledger: {
      entries: Number(entries.rows[0].c),
      lastHash: entries.rows[0].last_hash,
    },
    integrity: {
      supplyInvariantOk: invariantDiff === 0n,
      supplyDiffUnits: invariantDiff.toString(),
    },
  });
});
