import { z } from "zod";
import { CRYPTO_VS_CURRENCIES, CRYPTO_OHLC_DAYS, isCryptoOhlcDays } from "@/lib/crypto/coingecko";

/** Query params for GET /api/crypto/markets. */
export const CryptoMarketsQuerySchema = z.object({
  vs_currency: z.enum(CRYPTO_VS_CURRENCIES).default("usd"),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
});

/** Route params for GET /api/crypto/ohlc/[id] (CoinGecko coin id). */
export const CryptoOhlcParamsSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/) });

/** Query params for GET /api/crypto/ohlc/[id]. */
export const CryptoOhlcQuerySchema = z.object({
  vs_currency: z.enum(CRYPTO_VS_CURRENCIES).default("usd"),
  days: z.coerce
    .number()
    .int()
    .refine(isCryptoOhlcDays, { message: `days must be one of ${CRYPTO_OHLC_DAYS.join(",")}` })
    .default(30),
});
