import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { swypikFetch, SwypikChainError } from "@/lib/swypik-chain/client";
import type { MineClaimResult } from "@/lib/swypik-chain/types";

export const dynamic = "force-dynamic";

type ClaimBody = {
  challenge?: string;
  nonce?: string;
  issued_at?: number;
  device_hash?: string;
};

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.challenge || !body.nonce || typeof body.issued_at !== "number") {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  try {
    const data = await swypikFetch<MineClaimResult>("/v1/mining/claim", {
      method: "POST",
      userId: user.userId,
      body: {
        challenge: body.challenge,
        nonce: body.nonce,
        issued_at: body.issued_at,
        device_hash: (body.device_hash ?? "").slice(0, 128),
      },
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SwypikChainError) {
      return NextResponse.json(
        { error: err.code ?? "chain_error", message: err.message, retry_at: err.retryAt },
        { status: err.status },
      );
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
