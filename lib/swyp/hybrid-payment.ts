/**
 * Plată hibridă cu SWYP — cât acoperă SWYP-ul, restul cu cardul.
 *
 * Generalizarea logicii deja folosite la curse (lib/payments/mobility.ts),
 * ca să funcționeze identic pentru comenzi shop, Eats, cazări etc.
 *
 * Reguli:
 *  - se acoperă cel mult `maxPct` din total (implicit 50%) — platforma trebuie
 *    să încaseze și bani reali la fiecare tranzacție, altfel fondul nu crește;
 *  - limitat de soldul userului, de cursul curent și de fondul de acoperire
 *    (inclusiv rezerva anti-bank-run);
 *  - idempotent după (refType, refId) — un dublu-apel nu debitează de două ori;
 *  - la orice eroare: 0 acoperit, plata continuă integral pe metoda de bază.
 *    Un eșec de SWYP nu are voie să blocheze o vânzare reală.
 */
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getSwypRate, unitsToCents, redeemSwypForPayment } from "./valuation";
import { getSwypBalanceUnits } from "./ledger";

const log = logger.child({ mod: "swyp/hybrid" });

/** Procentul maxim din total care poate fi plătit în SWYP (config). */
export async function maxSwypPct(): Promise<number> {
  const { rows } = await dbQuery<{ value: unknown }>(
    `SELECT value FROM platform_config WHERE key = 'swyp_max_payment_pct'`,
  );
  const v = Number(rows[0]?.value ?? 50);
  return Number.isFinite(v) && v > 0 && v <= 100 ? v : 50;
}

export type SwypQuote = {
  /** Cât poate acoperi userul acum, în cenți. */
  maxCents: number;
  /** Câți SWYP costă asta (subunități). */
  units: string;
  /** Soldul userului, subunități. */
  balanceUnits: string;
  /** Plafonul procentual aplicat. */
  maxPct: number;
  /** Cursul e 0 (fără tranzacții reale încă) → SWYP nu poate plăti. */
  unavailable: boolean;
};

/** Cât poate plăti userul în SWYP dintr-un total dat — pentru afișare în checkout. */
export async function quoteSwypForTotal(userId: string, totalCents: number): Promise<SwypQuote> {
  const pct = await maxSwypPct();
  const empty: SwypQuote = { maxCents: 0, units: "0", balanceUnits: "0", maxPct: pct, unavailable: true };
  if (totalCents <= 0) return empty;

  try {
    const [rate, balanceUnits] = await Promise.all([getSwypRate(), getSwypBalanceUnits(userId)]);
    if (rate.rate_microcents_per_unit === 0n || balanceUnits <= 0n) {
      return { ...empty, balanceUnits: balanceUnits.toString() };
    }
    const capByPct = Math.floor((totalCents * pct) / 100);
    const capByBalance = Number(unitsToCents(balanceUnits, rate));
    const maxCents = Math.max(0, Math.min(capByPct, capByBalance));
    return {
      maxCents,
      units: maxCents > 0 ? String(Number(balanceUnits)) : "0",
      balanceUnits: balanceUnits.toString(),
      maxPct: pct,
      unavailable: maxCents === 0,
    };
  } catch (err) {
    log.warn({ err, userId }, "swyp quote failed");
    return empty;
  }
}

/**
 * Aplică plata în SWYP asupra unui total și returnează cât rămâne de plătit
 * cu cardul. Best-effort: la orice problemă, întoarce totalul neatins.
 */
export async function applySwypToTotal(args: {
  userId: string | null;
  totalCents: number;
  requestedCents?: number; // cât vrea userul să plătească în SWYP (opțional)
  refType: string;
  refId: string;
}): Promise<{ swypCents: number; remainingCents: number }> {
  const { userId, totalCents, refType, refId } = args;
  if (!userId || totalCents <= 0) return { swypCents: 0, remainingCents: totalCents };

  try {
    const quote = await quoteSwypForTotal(userId, totalCents);
    const want = Math.min(
      quote.maxCents,
      args.requestedCents && args.requestedCents > 0 ? args.requestedCents : quote.maxCents,
    );
    if (want <= 0) return { swypCents: 0, remainingCents: totalCents };

    const redeemed = await redeemSwypForPayment({ userId, cents: want, refType, refId });
    if (!redeemed.ok) {
      log.info({ userId, refId, reason: redeemed.reason }, "swyp redeem refuzat");
      return { swypCents: 0, remainingCents: totalCents };
    }
    const covered = redeemed.cents_covered;
    log.info({ userId, refId, covered, totalCents }, "swyp hybrid payment applied");
    return { swypCents: covered, remainingCents: Math.max(0, totalCents - covered) };
  } catch (err) {
    // Niciodată nu blocăm vânzarea din cauza SWYP.
    log.warn({ err, userId, refId }, "swyp hybrid failed — plata continuă integral pe card");
    return { swypCents: 0, remainingCents: totalCents };
  }
}
