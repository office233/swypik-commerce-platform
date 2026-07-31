/**
 * Sesiuni de mining SWYP (mecanica Pi Network).
 *
 *  - o sesiune durează 24h; userul o pornește manual (retenție zilnică);
 *  - rata scade global pe măsură ce rețeaua crește (halving la praguri de
 *    utilizatori) → urgență + protejarea trezoreriei;
 *  - streak: +10% per zi consecutivă, plafonat la +100%;
 *  - rata e ÎNGHEȚATĂ la pornirea sesiunii (userul știe ce câștigă);
 *  - la claim, plata trece prin awardSwyp → ledger idempotent.
 */
import { dbQuery } from "@/lib/db";
import { awardSwyp } from "./rewards";

/** Parametri economici — din DB, ca să poată fi ajustați fără deploy. */
async function miningParams(): Promise<{
    sessionHours: number;
    streakBonusPerDay: number;
    streakBonusMax: number;
    graceHours: number;
}> {
    const { rows } = await dbQuery<{ key: string; value: unknown }>(
        `SELECT key, value FROM platform_config
            WHERE key IN ('swyp_mining_session_hours','swyp_streak_bonus_per_day_bps',
                                        'swyp_streak_bonus_max_bps','swyp_streak_grace_hours')`,
    );
    const m = new Map(rows.map((r) => [r.key, Number(r.value)]));
    const num = (k: string, d: number) => {
        const v = m.get(k);
        return Number.isFinite(v) && (v as number) > 0 ? (v as number) : d;
    };
    return {
        sessionHours: num("swyp_mining_session_hours", 24),
        streakBonusPerDay: num("swyp_streak_bonus_per_day_bps", 1000) / 10_000,
        streakBonusMax: num("swyp_streak_bonus_max_bps", 10_000) / 10_000,
        graceHours: num("swyp_streak_grace_hours", 48),
    };
}

/** Numărul de halving-uri atinse, în funcție de câți utilizatori are rețeaua. */
export async function getHalvingFactor(): Promise<{ users: number; halvings: number; factor: number }> {
    const [{ rows: cfgRows }, { rows: userRows }] = await Promise.all([
        dbQuery<{ value: string }>(
            `SELECT value::text AS value FROM swyp_config WHERE key = 'emission_halving_user_thresholds'`,
        ),
        dbQuery<{ c: string }>(`SELECT COUNT(*)::text AS c FROM users`),
    ]);
    const thresholds: number[] = cfgRows[0] ? JSON.parse(cfgRows[0].value) : [];
    const users = Number(userRows[0]?.c ?? "0");
    const halvings = thresholds.filter((t) => users >= t).length;
    return { users, halvings, factor: 1 / 2 ** halvings };
}

/** Mineri reali: useri cu cel puțin o sesiune de mining (activă sau revendicată). */
export async function getMinerCount(): Promise<number> {
    const { rows } = await dbQuery<{ c: string }>(
        `SELECT COUNT(DISTINCT user_id)::text AS c FROM swyp_mining_sessions`,
    );
    return Number(rows[0]?.c ?? "0");
}

/** Rata curentă (subunități/sesiune) pentru un user, cu halving + streak. */
export async function computeMiningRate(userId: string): Promise<{
    rateUnits: bigint;
    streakDays: number;
    halvings: number;
    networkUsers: number;
}> {
    const [{ rows: ruleRows }, halving, streakDays, params] = await Promise.all([
        dbQuery<{ amount_units: string; enabled: boolean }>(
            `SELECT amount_units::text, enabled FROM swyp_emission_rules WHERE action = 'mining_daily'`,
        ),
        getHalvingFactor(),
        getStreakDays(userId),
        miningParams(),
    ]);
    const base = BigInt(ruleRows[0]?.amount_units ?? "0");
    const streakBonus = Math.min(params.streakBonusMax, (streakDays - 1) * params.streakBonusPerDay);
    // aritmetică întreagă: base * factor * (1 + bonus), cu 4 zecimale de precizie
    const multiplier = BigInt(Math.round(halving.factor * (1 + streakBonus) * 10000));
    const rateUnits = (base * multiplier) / 10000n;
    return {
        rateUnits: rateUnits > 0n ? rateUnits : 1n,
        streakDays,
        halvings: halving.halvings,
        networkUsers: halving.users,
    };
}

/** Streak curent: nr. de zile consecutive cu sesiuni revendicate (min 1). */
async function getStreakDays(userId: string): Promise<number> {
    // O singură interogare (înainte erau două identice) pentru ultima sesiune
    // revendicată: ne trebuie și momentul, și streak-ul de atunci.
    const { rows } = await dbQuery<{ claimed_at: string; streak_days: number }>(
        `SELECT claimed_at::text, streak_days FROM swyp_mining_sessions
                    WHERE user_id = $1 AND claimed_at IS NOT NULL
                    ORDER BY claimed_at DESC LIMIT 1`,
        [userId],
    );
    if (!rows[0]) return 1;
    const { graceHours } = await miningParams();
    const hoursSince = (Date.now() - new Date(rows[0].claimed_at).getTime()) / 3_600_000;
    // fereastră de grație: revendici în interval ⇒ streak-ul continuă
    if (hoursSince > graceHours) return 1;
    return (rows[0].streak_days ?? 0) + 1;
}

export type MiningStatus = {
    active: boolean;
    sessionId: string | null;
    endsAt: string | null;
    claimable: boolean;
    rateUnits: string;
    streakDays: number;
    halvings: number;
    networkUsers: number;
    miners: number;
};

export async function getMiningStatus(userId: string): Promise<MiningStatus> {
    const { rows } = await dbQuery<{ id: string; ends_at: string; rate_units: string; streak_days: number }>(
        `SELECT id::text, ends_at::text, rate_units::text, streak_days
       FROM swyp_mining_sessions WHERE user_id = $1 AND claimed_at IS NULL LIMIT 1`,
        [userId],
    );
    const [rate, miners] = await Promise.all([computeMiningRate(userId), getMinerCount()]);
    const s = rows[0];
    return {
        active: Boolean(s),
        sessionId: s?.id ?? null,
        endsAt: s?.ends_at ?? null,
        claimable: Boolean(s) && new Date(s.ends_at) <= new Date(),
        rateUnits: (s ? BigInt(s.rate_units) : rate.rateUnits).toString(),
        streakDays: s?.streak_days ?? rate.streakDays,
        halvings: rate.halvings,
        networkUsers: rate.networkUsers,
        miners,
    };
}

/** Pornește o sesiune de mining. Idempotent: dacă există una activă, o returnează. */
export async function startMiningSession(userId: string): Promise<MiningStatus> {
    const [rate, params] = await Promise.all([computeMiningRate(userId), miningParams()]);
    await dbQuery(
        `INSERT INTO swyp_mining_sessions (user_id, ends_at, streak_days, rate_units)
     VALUES ($1, now() + ($4 || ' hours')::interval, $2, $3)
     ON CONFLICT (user_id) WHERE claimed_at IS NULL DO NOTHING`,
        [userId, rate.streakDays, rate.rateUnits.toString(), String(params.sessionHours)],
    );
    return getMiningStatus(userId);
}

export type ClaimResult =
    | { claimed: true; amountUnits: string; status: MiningStatus }
    | { claimed: false; reason: "no_session" | "not_finished" | "award_rejected"; status: MiningStatus };

/** Revendică o sesiune încheiată. Plata trece prin ledger (idempotent pe session id). */
export async function claimMiningSession(userId: string): Promise<ClaimResult> {
    const { rows } = await dbQuery<{ id: string; rate_units: string; ends_at: string }>(
        `SELECT id::text, rate_units::text, ends_at::text
       FROM swyp_mining_sessions WHERE user_id = $1 AND claimed_at IS NULL LIMIT 1`,
        [userId],
    );
    const session = rows[0];
    if (!session) return { claimed: false, reason: "no_session", status: await getMiningStatus(userId) };
    if (new Date(session.ends_at) > new Date()) {
        return { claimed: false, reason: "not_finished", status: await getMiningStatus(userId) };
    }

    const award = await awardSwyp({
        userId,
        action: "mining_daily",
        refId: session.id,
        amountUnitsOverride: BigInt(session.rate_units),
        metadata: { session_id: session.id },
    });
    if (!award.awarded) {
        return { claimed: false, reason: "award_rejected", status: await getMiningStatus(userId) };
    }

    await dbQuery(
        `UPDATE swyp_mining_sessions SET claimed_at = now(), ledger_entry_id = $2
      WHERE id = $1 AND claimed_at IS NULL`,
        [session.id, award.entry.id],
    );
    return { claimed: true, amountUnits: session.rate_units, status: await getMiningStatus(userId) };
}
