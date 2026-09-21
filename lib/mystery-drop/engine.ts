/**
 * Mystery Drop — cutia zilnică.
 *
 * Reguli:
 *  - o revendicare pe (user, zi UTC), garantată de UNIQUE în mystery_drop_claims —
 *    clientul nu trimite nimic despre „ultima revendicare";
 *  - singurul premiu care se acordă efectiv este SWYP, prin motorul de
 *    recompense (swyp_emission_rules.action = 'mystery_drop_daily'): sumă,
 *    plafon zilnic și on/off sunt configurabile din DB;
 *  - dacă acordarea eșuează (regulă oprită, plafon atins), revendicarea se
 *    anulează și userul primește motivul — nu i se arată un premiu fictiv.
 */
import { dbQuery } from "@/lib/db";
import { awardSwyp } from "@/lib/swyp/rewards";
import { logger } from "@/lib/logger";

export const SWYP_UNITS_PER_COIN = 100n;

export interface MysteryDropReward {
    id: string;
    kind: "swyp";
    /** Monede SWYP creditate efectiv. */
    swypAmount: number;
    badge: string;
    icon: string;
}

/** Trepte de premiu; suma efectivă poate fi redusă de plafonul zilnic al regulii. */
const REWARD_TIERS: ReadonlyArray<{ id: string; units: bigint; weight: number; badge: string }> = [
    { id: "swyp_5", units: 500n, weight: 50, badge: "CÂȘTIG GARANTAT" },
    { id: "swyp_10", units: 1000n, weight: 35, badge: "DROP NOROCOS" },
    { id: "swyp_25", units: 2500n, weight: 15, badge: "MARELE PREMIU" },
];

export type ClaimFailure = "already_claimed" | "rule_disabled" | "rule_missing" | "daily_cap_reached" | "paid_tx_required";

export type ClaimResult =
    | { ok: true; reward: MysteryDropReward; claimedAt: string }
    | { ok: false; reason: ClaimFailure };

export function pickRewardTier(random = Math.random()): (typeof REWARD_TIERS)[number] {
    const total = REWARD_TIERS.reduce((sum, t) => sum + t.weight, 0);
    let cursor = random * total;
    for (const tier of REWARD_TIERS) {
        if (cursor < tier.weight) return tier;
        cursor -= tier.weight;
    }
    return REWARD_TIERS[0];
}

/** Ziua UTC curentă, ca `YYYY-MM-DD` — cheia de unicitate a revendicării. */
export function claimDateUtc(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export async function claimDailyDrop(userId: string): Promise<ClaimResult> {
    const tier = pickRewardTier();
    const claimDate = claimDateUtc();

    // Garda atomică: ON CONFLICT DO NOTHING nu întoarce rând dacă ziua e deja luată.
    const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO mystery_drop_claims (user_id, claim_date, reward_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, claim_date) DO NOTHING
         RETURNING id`,
        [userId, claimDate, tier.id],
    );
    const claimId = rows[0]?.id;
    if (!claimId) return { ok: false, reason: "already_claimed" };

    const award = await awardSwyp({
        userId,
        action: "mystery_drop_daily",
        refId: `mystery_drop:${claimId}`,
        amountUnitsOverride: tier.units,
        metadata: { claim_date: claimDate, tier: tier.id },
    });

    if (!award.awarded) {
        // Fără credit real nu există premiu: eliberăm ziua ca userul să poată reveni.
        await dbQuery(`DELETE FROM mystery_drop_claims WHERE id = $1`, [claimId]);
        logger.info({ userId, reason: award.reason }, "mystery_drop.claim_rejected");
        return { ok: false, reason: award.reason };
    }

    await dbQuery(
        `UPDATE mystery_drop_claims SET swyp_units = $2, ledger_ref = $3 WHERE id = $1`,
        [claimId, tier.units.toString(), award.entry?.id ?? null],
    );

    return {
        ok: true,
        claimedAt: new Date().toISOString(),
        reward: {
            id: tier.id,
            kind: "swyp",
            swypAmount: Number(tier.units / SWYP_UNITS_PER_COIN),
            badge: tier.badge,
            icon: "🪙",
        },
    };
}
