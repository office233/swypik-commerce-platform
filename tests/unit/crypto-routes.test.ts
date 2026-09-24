import { describe, it, expect } from "vitest";
import {
  CryptoMarketsQuerySchema,
  CryptoOhlcParamsSchema,
  CryptoOhlcQuerySchema,
} from "@/lib/crypto/query-schemas";

const marketsTestables = { QuerySchema: CryptoMarketsQuerySchema };
const ohlcTestables = { ParamsSchema: CryptoOhlcParamsSchema, QuerySchema: CryptoOhlcQuerySchema };

describe("api/crypto/markets query validation", () => {
  const { QuerySchema } = marketsTestables;

  it("aplică default-uri (vs_currency=usd, per_page=50) când lipsesc", () => {
    const parsed = QuerySchema.safeParse({ vs_currency: undefined, per_page: undefined });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ vs_currency: "usd", per_page: 50 });
    }
  });

  it("acceptă eur/ron și un per_page valid", () => {
    expect(QuerySchema.safeParse({ vs_currency: "eur", per_page: "10" }).success).toBe(true);
    expect(QuerySchema.safeParse({ vs_currency: "ron", per_page: "100" }).success).toBe(true);
  });

  it("respinge o monedă necunoscută", () => {
    expect(QuerySchema.safeParse({ vs_currency: "gbp", per_page: "10" }).success).toBe(false);
  });

  it("respinge per_page în afara intervalului [1,100]", () => {
    expect(QuerySchema.safeParse({ vs_currency: "usd", per_page: "0" }).success).toBe(false);
    expect(QuerySchema.safeParse({ vs_currency: "usd", per_page: "101" }).success).toBe(false);
  });
});

describe("api/crypto/ohlc/[id] param + query validation", () => {
  const { ParamsSchema, QuerySchema } = ohlcTestables;

  it("acceptă un id CoinGecko valid (litere minuscule, cifre, cratimă)", () => {
    expect(ParamsSchema.safeParse({ id: "bitcoin" }).success).toBe(true);
    expect(ParamsSchema.safeParse({ id: "matic-network" }).success).toBe(true);
  });

  it("respinge id cu majuscule, spații sau caractere speciale", () => {
    expect(ParamsSchema.safeParse({ id: "Bitcoin" }).success).toBe(false);
    expect(ParamsSchema.safeParse({ id: "bit coin" }).success).toBe(false);
    expect(ParamsSchema.safeParse({ id: "../../etc/passwd" }).success).toBe(false);
    expect(ParamsSchema.safeParse({ id: "" }).success).toBe(false);
  });

  it("respinge un id mai lung de 64 caractere", () => {
    expect(ParamsSchema.safeParse({ id: "a".repeat(65) }).success).toBe(false);
  });

  it("aplică default days=30 și acceptă doar valorile din setul permis", () => {
    const parsed = QuerySchema.safeParse({ vs_currency: undefined, days: undefined });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.days).toBe(30);

    for (const d of [1, 7, 14, 30, 90, 180, 365]) {
      expect(QuerySchema.safeParse({ vs_currency: "usd", days: String(d) }).success).toBe(true);
    }
    expect(QuerySchema.safeParse({ vs_currency: "usd", days: "5" }).success).toBe(false);
    expect(QuerySchema.safeParse({ vs_currency: "usd", days: "3650" }).success).toBe(false);
  });
});
