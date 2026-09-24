/**
 * Client CoinGecko (API publică, gratuită) pentru rândul onest „Piață Crypto”.
 * Fără cheie API, endpoint-urile publice merg oricum (rate limit mai strict);
 * cu `COINGECKO_API_KEY` setat, trimitem header-ul demo-key oficial.
 * NU simulăm niciodată date: la orice eroare/payload invalid întoarcem [] și
 * logăm un warning — vezi `getCryptoMarkets` / `getCryptoOhlc`.
 */
import { z } from "zod";
import { logger } from "@/lib/logger";

const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
const FETCH_TIMEOUT_MS = 6000;
const MARKETS_CACHE_TTL_MS = 60_000; // 60s
const OHLC_CACHE_TTL_MS = 300_000; // 300s

export const CRYPTO_VS_CURRENCIES = ["usd", "eur", "ron"] as const;
export type CryptoVsCurrency = (typeof CRYPTO_VS_CURRENCIES)[number];

export function isCryptoVsCurrency(value: unknown): value is CryptoVsCurrency {
  return typeof value === "string" && (CRYPTO_VS_CURRENCIES as readonly string[]).includes(value);
}

export const CRYPTO_OHLC_DAYS = [1, 7, 14, 30, 90, 180, 365] as const;
export type CryptoOhlcDays = (typeof CRYPTO_OHLC_DAYS)[number];

export function isCryptoOhlcDays(value: number): value is CryptoOhlcDays {
  return (CRYPTO_OHLC_DAYS as readonly number[]).includes(value);
}

const MarketCoinSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  image: z.string().nullable().optional(),
  current_price: z.number().nullable(),
  market_cap: z.number().nullable(),
  market_cap_rank: z.number().nullable().optional(),
  total_volume: z.number().nullable(),
  price_change_percentage_24h: z.number().nullable(),
  sparkline_in_7d: z.object({ price: z.array(z.number()) }).optional(),
});

const MarketsResponseSchema = z.array(MarketCoinSchema);

export interface CryptoMarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  currentPrice: number | null;
  marketCap: number | null;
  marketCapRank: number | null;
  totalVolume: number | null;
  priceChangePercentage24h: number | null;
  sparkline7d: number[];
}

const OhlcResponseSchema = z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]));

export interface CryptoOhlcPoint {
  /** UNIX seconds — compatibil cu `UTCTimestamp` din lightweight-charts. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function apiHeaders(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-demo-api-key": key } : {};
}

function cgFetch(path: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(`${COINGECKO_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetch(url.toString(), {
    headers: { accept: "application/json", ...apiHeaders() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

const marketsCache = new Map<string, { expiresAt: number; items: CryptoMarketCoin[] }>();

/** Top-N monede după capitalizare, cu preț/variație 24h/sparkline 7 zile. [] la orice eroare. */
export async function getCryptoMarkets(
  vsCurrency: CryptoVsCurrency = "usd",
  perPage = 50,
): Promise<CryptoMarketCoin[]> {
  const cacheKey = `${vsCurrency}:${perPage}`;
  const cached = marketsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  try {
    const res = await cgFetch("/coins/markets", {
      vs_currency: vsCurrency,
      order: "market_cap_desc",
      per_page: String(perPage),
      page: "1",
      sparkline: "true",
      price_change_percentage: "24h",
    });
    if (!res.ok) {
      logger.warn({ status: res.status, vsCurrency }, "coingecko markets request failed");
      return cached?.items ?? [];
    }
    const data: unknown = await res.json();
    const parsed = MarketsResponseSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues.slice(0, 3) }, "coingecko markets payload invalid");
      return cached?.items ?? [];
    }
    const items = parsed.data.map(
      (c): CryptoMarketCoin => ({
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        image: c.image ?? null,
        currentPrice: c.current_price,
        marketCap: c.market_cap,
        marketCapRank: c.market_cap_rank ?? null,
        totalVolume: c.total_volume,
        priceChangePercentage24h: c.price_change_percentage_24h,
        sparkline7d: c.sparkline_in_7d?.price ?? [],
      }),
    );
    marketsCache.set(cacheKey, { items, expiresAt: Date.now() + MARKETS_CACHE_TTL_MS });
    return items;
  } catch (err) {
    logger.warn({ err, vsCurrency }, "coingecko markets fetch error");
    return cached?.items ?? [];
  }
}

const ohlcCache = new Map<string, { expiresAt: number; items: CryptoOhlcPoint[] }>();

/** Lumânări OHLC reale pentru graficul monedei `id`. [] la orice eroare/payload invalid. */
export async function getCryptoOhlc(
  id: string,
  vsCurrency: CryptoVsCurrency = "usd",
  days: CryptoOhlcDays = 30,
): Promise<CryptoOhlcPoint[]> {
  const cacheKey = `${id}:${vsCurrency}:${days}`;
  const cached = ohlcCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  try {
    const res = await cgFetch(`/coins/${id}/ohlc`, { vs_currency: vsCurrency, days: String(days) });
    if (!res.ok) {
      logger.warn({ status: res.status, id, vsCurrency }, "coingecko ohlc request failed");
      return cached?.items ?? [];
    }
    const data: unknown = await res.json();
    const parsed = OhlcResponseSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn({ id, vsCurrency }, "coingecko ohlc payload invalid");
      return cached?.items ?? [];
    }
    const items = parsed.data.map(
      ([t, open, high, low, close]): CryptoOhlcPoint => ({
        time: Math.floor(t / 1000),
        open,
        high,
        low,
        close,
      }),
    );
    ohlcCache.set(cacheKey, { items, expiresAt: Date.now() + OHLC_CACHE_TTL_MS });
    return items;
  } catch (err) {
    logger.warn({ err, id, vsCurrency }, "coingecko ohlc fetch error");
    return cached?.items ?? [];
  }
}

/** Exportat doar pentru teste unitare. */
export const __testables = { MarketsResponseSchema, OhlcResponseSchema };
