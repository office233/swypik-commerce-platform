import { describe, it, expect } from "vitest";
import { squadPriceCents, SQUAD_DISCOUNT_PCT, SQUAD_REQUIRED_MEMBERS, SQUAD_TTL_HOURS } from "@/lib/squad/config";

describe("Squad Buy — configurație", () => {
  it("prețul de squad aplică procentul configurat", () => {
    expect(squadPriceCents(10000)).toBe(Math.round(10000 * (1 - SQUAD_DISCOUNT_PCT / 100)));
  });
  it("valorile implicite sunt în limitele sănătoase", () => {
    expect(SQUAD_DISCOUNT_PCT).toBeGreaterThan(0);
    expect(SQUAD_DISCOUNT_PCT).toBeLessThan(100);
    expect(SQUAD_REQUIRED_MEMBERS).toBeGreaterThanOrEqual(2);
    expect(SQUAD_TTL_HOURS).toBeGreaterThan(0);
  });
});
