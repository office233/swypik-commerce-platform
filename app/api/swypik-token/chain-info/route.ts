import { NextResponse } from "next/server";
import { swypikFetch, SwypikChainError } from "@/lib/swypik-chain/client";

export const dynamic = "force-dynamic";

type ChainInfo = {
  chain_id: string;
  total_blocks: number;
  total_txs: number;
  total_addresses: number;
  circulating_supply: string;
  hard_cap: string;
};

/**
 * Public chain info — global supply/blocks/txs/addresses for the $SWYP chain.
 * Suitable for marketing pages, badges, and on-page widgets. Cached 10 min at edge.
 */
export async function GET() {
  try {
    const data = await swypikFetch<ChainInfo>("/v1/chain/info", {});
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (err) {
    if (err instanceof SwypikChainError) {
      return NextResponse.json({ error: err.code ?? "chain_error", message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
