/**
 * GET /api/crypto/ohlc/{id}?vs_currency=usd&days=30
 * Lumânări OHLC reale (CoinGecko public API) pentru graficul unei monede, cache 300s.
 */
import { NextResponse } from "next/server";
import { CryptoOhlcParamsSchema, CryptoOhlcQuerySchema } from "@/lib/crypto/query-schemas";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { withErrorHandling } from "@/lib/api-handler";
import { getCryptoOhlc } from "@/lib/crypto/coingecko";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isEnabled("crypto")) return frozenResponse("crypto");

  const rl = await rateLimit("cryptoOhlc", getClientIP(req), { limit: 30, window: 60 });
  if (!rl.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await ctx.params;
  const idParsed = CryptoOhlcParamsSchema.safeParse({ id });
  if (!idParsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const parsed = CryptoOhlcQuerySchema.safeParse({
    vs_currency: url.searchParams.get("vs_currency") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const candles = await getCryptoOhlc(idParsed.data.id, parsed.data.vs_currency, parsed.data.days);
  return NextResponse.json({ candles, vsCurrency: parsed.data.vs_currency, days: parsed.data.days });
});

/** Exportat doar pentru teste unitare. */
