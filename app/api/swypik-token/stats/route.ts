import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { swypikFetch, SwypikChainError } from "@/lib/swypik-chain/client";
import { rateLimit } from "@/lib/security/rate-limit";
import type { SwypikStats } from "@/lib/swypik-chain/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const rl = await rateLimit("swypikStats", user.userId);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const data = await swypikFetch<SwypikStats>("/v1/mining/stats", { userId: user.userId });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SwypikChainError) {
      return NextResponse.json({ error: err.code ?? "chain_error", message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
