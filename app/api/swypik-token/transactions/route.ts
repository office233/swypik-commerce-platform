import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { swypikFetch, SwypikChainError } from "@/lib/swypik-chain/client";
import type { SwypikTxPage } from "@/lib/swypik-chain/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") ?? "50";
  const cursor = url.searchParams.get("cursor");
  const qs = new URLSearchParams({ limit });
  if (cursor) qs.set("cursor", cursor);
  try {
    const data = await swypikFetch<SwypikTxPage>(`/v1/chain/transactions?${qs}`, { userId: user.userId });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SwypikChainError) {
      return NextResponse.json({ error: err.code ?? "chain_error", message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
