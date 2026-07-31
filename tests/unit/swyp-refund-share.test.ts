import { describe, it, expect } from "vitest";
import { computeSwypRefundShare } from "@/lib/swyp/refund";

describe("computeSwypRefundShare", () => {
  it("full refund returns the entire SWYP spend", () => {
    const r = computeSwypRefundShare({
      spentUnits: 500n,
      spentCents: 1000,
      amountRefunded: 5000,
      amountTotal: 5000,
    });
    expect(r.units).toBe(500n);
    expect(r.cents).toBe(1000);
  });

  it("amountRefunded greater than total is treated as full refund", () => {
    const r = computeSwypRefundShare({
      spentUnits: 500n,
      spentCents: 1000,
      amountRefunded: 9999,
      amountTotal: 5000,
    });
    expect(r.units).toBe(500n);
    expect(r.cents).toBe(1000);
  });

  it("amountTotal 0 (fully SWYP-covered card part missing) refunds everything", () => {
    const r = computeSwypRefundShare({
      spentUnits: 300n,
      spentCents: 600,
      amountRefunded: 1,
      amountTotal: 0,
    });
    expect(r.units).toBe(300n);
    expect(r.cents).toBe(600);
  });

  it("partial refund is proportional, rounded down", () => {
    const r = computeSwypRefundShare({
      spentUnits: 500n,
      spentCents: 1000,
      amountRefunded: 2500,
      amountTotal: 5000,
    });
    expect(r.units).toBe(250n);
    expect(r.cents).toBe(500);
  });

  it("proportional rounding never exceeds spend (floor)", () => {
    const r = computeSwypRefundShare({
      spentUnits: 100n,
      spentCents: 333,
      amountRefunded: 1,
      amountTotal: 3,
    });
    expect(r.units).toBe(33n);
    expect(r.cents).toBe(111);
  });

  it("incremental partial refund credits only the delta", () => {
    const first = computeSwypRefundShare({
      spentUnits: 500n,
      spentCents: 1000,
      amountRefunded: 2500,
      amountTotal: 5000,
    });
    expect(first.units).toBe(250n);
    const second = computeSwypRefundShare({
      spentUnits: 500n,
      spentCents: 1000,
      amountRefunded: 5000,
      amountTotal: 5000,
      alreadyRefundedUnits: first.units,
      alreadyRefundedCents: first.cents,
    });
    expect(second.units).toBe(250n);
    expect(second.cents).toBe(500);
  });

  it("retry of the same cumulative amount is a no-op", () => {
    const r = computeSwypRefundShare({
      spentUnits: 500n,
      spentCents: 1000,
      amountRefunded: 2500,
      amountTotal: 5000,
      alreadyRefundedUnits: 250n,
      alreadyRefundedCents: 500,
    });
    expect(r.units).toBe(0n);
    expect(r.cents).toBe(0);
  });

  it("already refunded more than target yields zero (never negative)", () => {
    const r = computeSwypRefundShare({
      spentUnits: 500n,
      spentCents: 1000,
      amountRefunded: 1000,
      amountTotal: 5000,
      alreadyRefundedUnits: 250n,
      alreadyRefundedCents: 500,
    });
    expect(r.units).toBe(0n);
    expect(r.cents).toBe(0);
  });

  it("zero spend or zero refunded returns zero", () => {
    expect(
      computeSwypRefundShare({ spentUnits: 0n, spentCents: 0, amountRefunded: 100, amountTotal: 100 }).units,
    ).toBe(0n);
    expect(
      computeSwypRefundShare({ spentUnits: 100n, spentCents: 50, amountRefunded: 0, amountTotal: 100 }).units,
    ).toBe(0n);
  });

  it("cents are capped at remaining spend cents", () => {
    const r = computeSwypRefundShare({
      spentUnits: 500n,
      spentCents: 1000,
      amountRefunded: 5000,
      amountTotal: 5000,
      alreadyRefundedUnits: 100n,
      alreadyRefundedCents: 900,
    });
    expect(r.units).toBe(400n);
    expect(r.cents).toBe(100);
  });
});
