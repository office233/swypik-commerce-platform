/** Comision creator în basis points. Configurabil prin env CREATOR_COMMISSION_BPS (default 500 = 5%). */
const envBps = Number(process.env.CREATOR_COMMISSION_BPS);
export const CREATOR_COMMISSION_RATE_BPS =
  Number.isFinite(envBps) && envBps > 0 && envBps <= 10_000 ? Math.trunc(envBps) : 500;

export type CreatorEarningsInput = {
  totalVideos: number;
  totalSalesCents: number;
  totalOrders: number;
  paidCommissionableCents: number;
  pendingCommissionableCents: number;
  failedCommissionableCents: number;
  blockedCommissionableCents: number;
  paidItems: number;
  pendingItems: number;
  failedItems: number;
  blockedItems: number;
  thisMonthSalesCents: number;
  thisMonthOrders: number;
};

export type CreatorEarningsSummary = {
  totalVideos: number;
  totalSalesCents: number;
  totalOrders: number;
  earningsCents: number;
  paidOutCents: number;
  pendingCents: number;
  payoutStatus: {
    paidCents: number;
    pendingCents: number;
    failedCents: number;
    blockedCents: number;
    paidItems: number;
    pendingItems: number;
    failedItems: number;
    blockedItems: number;
  };
  analytics: {
    averageOrderCents: number;
    thisMonthSalesCents: number;
    thisMonthOrders: number;
    thisMonthEarningsCents: number;
  };
};

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateCreatorCommissionCents(amountCents: number): number {
  return Math.round(toNumber(amountCents) * CREATOR_COMMISSION_RATE_BPS / 10_000);
}

export function summarizeCreatorEarnings(input: CreatorEarningsInput): CreatorEarningsSummary {
  const totalVideos = toNumber(input.totalVideos);
  const totalOrders = toNumber(input.totalOrders);
  const totalSalesCents = toNumber(input.totalSalesCents);
  const paidOutCents = calculateCreatorCommissionCents(input.paidCommissionableCents);
  const pendingCents = calculateCreatorCommissionCents(input.pendingCommissionableCents);
  const failedCents = calculateCreatorCommissionCents(input.failedCommissionableCents);
  const blockedCents = calculateCreatorCommissionCents(input.blockedCommissionableCents);

  return {
    totalVideos,
    totalSalesCents,
    totalOrders,
    earningsCents: calculateCreatorCommissionCents(totalSalesCents),
    paidOutCents,
    pendingCents,
    payoutStatus: {
      paidCents: paidOutCents,
      pendingCents,
      failedCents,
      blockedCents,
      paidItems: toNumber(input.paidItems),
      pendingItems: toNumber(input.pendingItems),
      failedItems: toNumber(input.failedItems),
      blockedItems: toNumber(input.blockedItems),
    },
    analytics: {
      averageOrderCents: totalOrders > 0 ? Math.round(totalSalesCents / totalOrders) : 0,
      thisMonthSalesCents: toNumber(input.thisMonthSalesCents),
      thisMonthOrders: toNumber(input.thisMonthOrders),
      thisMonthEarningsCents: calculateCreatorCommissionCents(input.thisMonthSalesCents),
    },
  };
}
