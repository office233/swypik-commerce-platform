import { NextRequest, NextResponse } from "next/server";
import { swypikFetch, SwypikChainError } from "@/lib/swypik-chain/client";
import type { LeaderboardEntry } from "@/lib/swypik-chain/types";

export const dynamic = "force-dynamic";

/**
 * Public leaderboard — anonymous-friendly. No auth required.
 * The underlying chain endpoint only exposes opt-in display data
 * (handle, total_mined, streak, refs, multiplier).
 */
export async function GET(req: NextRequest) {
  const limit = new URL(req.url).searchParams.get("limit") ?? "50";
  try {
    const data = await swypikFetch<{ top: LeaderboardEntry[] }>(
      `/v1/mining/leaderboard?limit=${encodeURIComponent(limit)}`,
      {},
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    if (err instanceof SwypikChainError) {
      return NextResponse.json({ error: err.code ?? "chain_error", message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
