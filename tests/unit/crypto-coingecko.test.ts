import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

async function freshCoingeckoModule() {
  vi.resetModules();
  return import("@/lib/crypto/coingecko");
}

describe("crypto/coingecko getCryptoMarkets", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("happy path: parsează și mapează răspunsul CoinGecko", async () => {
    const fetchSpy = vi.fn(async (_input: string | URL) =>
      new Response(
        JSON.stringify([
          {
            id: "bitcoin",
            symbol: "btc",
            name: "Bitcoin",
            image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
            current_price: 65420.5,
            market_cap: 1_280_000_000_000,
            market_cap_rank: 1,
            total_volume: 28_400_000_000,
            price_change_percentage_24h: 2.45,
            sparkline_in_7d: { price: [64000, 64500, 65000] },
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { getCryptoMarkets } = await freshCoingeckoModule();
    const result = await getCryptoMarkets("usd", 10);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain("/coins/markets");
    expect(calledUrl).toContain("vs_currency=usd");
    expect(result).toEqual([
      {
        id: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
        currentPrice: 65420.5,
        marketCap: 1_280_000_000_000,
        marketCapRank: 1,
        totalVolume: 28_400_000_000,
        priceChangePercentage24h: 2.45,
        sparkline7d: [64000, 64500, 65000],
      },
    ]);
  });

  it("payload invalid (schema zod eșuează) întoarce listă goală, fără să arunce", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ not: "an array" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { getCryptoMarkets } = await freshCoingeckoModule();
    const result = await getCryptoMarkets("usd", 10);
    expect(result).toEqual([]);
  });

  it("timeout/eroare de rețea întoarce listă goală", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new DOMException("The operation was aborted", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { getCryptoMarkets } = await freshCoingeckoModule();
    const result = await getCryptoMarkets("usd", 10);
    expect(result).toEqual([]);
  });

  it("răspuns non-ok (ex. 429) întoarce listă goală", async () => {
    const fetchSpy = vi.fn(async () => new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { getCryptoMarkets } = await freshCoingeckoModule();
    const result = await getCryptoMarkets("usd", 10);
    expect(result).toEqual([]);
  });
});

describe("crypto/coingecko getCryptoOhlc", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("happy path: mapează tuplurile [t,o,h,l,c] la lumânări cu time în secunde", async () => {
    const fetchSpy = vi.fn(async (_input: string | URL) =>
      new Response(JSON.stringify([[1_700_000_000_000, 100, 110, 95, 105]]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { getCryptoOhlc } = await freshCoingeckoModule();
    const result = await getCryptoOhlc("bitcoin", "usd", 30);

    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain("/coins/bitcoin/ohlc");
    expect(calledUrl).toContain("days=30");
    expect(result).toEqual([{ time: 1_700_000_000, open: 100, high: 110, low: 95, close: 105 }]);
  });

  it("payload invalid întoarce listă goală", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify([[1, 2, 3]]), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { getCryptoOhlc } = await freshCoingeckoModule();
    const result = await getCryptoOhlc("bitcoin", "usd", 30);
    expect(result).toEqual([]);
  });

  it("timeout întoarce listă goală", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new DOMException("The operation was aborted", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { getCryptoOhlc } = await freshCoingeckoModule();
    const result = await getCryptoOhlc("bitcoin", "usd", 30);
    expect(result).toEqual([]);
  });
});

describe("crypto/coingecko helpers", () => {
  it("isCryptoVsCurrency / isCryptoOhlcDays validează corect", async () => {
    const { isCryptoVsCurrency, isCryptoOhlcDays } = await freshCoingeckoModule();
    expect(isCryptoVsCurrency("usd")).toBe(true);
    expect(isCryptoVsCurrency("eur")).toBe(true);
    expect(isCryptoVsCurrency("ron")).toBe(true);
    expect(isCryptoVsCurrency("gbp")).toBe(false);
    expect(isCryptoOhlcDays(30)).toBe(true);
    expect(isCryptoOhlcDays(5)).toBe(false);
  });
});
