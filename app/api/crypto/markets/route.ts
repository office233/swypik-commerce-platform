/**
 * GET /api/crypto/markets?vs_currency=usd&per_page=50
 * Listă top monede (CoinGecko public API), cache 60s — vezi lib/crypto/coingecko.ts.
 */
import { NextResponse } from "next/server";
import { CryptoMarketsQuerySchema } from "@/lib/crypto/query-schemas";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { getCryptoMarkets } from "@/lib/crypto/coingecko";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async function GET(req: Request) {
  if (!isEnabled("crypto")) return frozenResponse("crypto");

  const rl = await rateLimit("cryptoMarkets", getClientIP(req), { limit: 30, window: 60 });
  if (!rl.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const parsed = CryptoMarketsQuerySchema.safeParse({
    vs_currency: url.searchParams.get("vs_currency") ?? undefined,
    per_page: url.searchParams.get("per_page") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const coins = await getCryptoMarkets(parsed.data.vs_currency, parsed.data.per_page);
  return NextResponse.json({ coins, vsCurrency: parsed.data.vs_currency });
});

/** Exportat doar pentru teste unitare. */
