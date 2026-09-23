import { NextRequest, NextResponse } from "next/server";
import { getDexSwapQuote } from "@/lib/crypto/dex";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isEnabled("crypto")) return frozenResponse("crypto");

  try {
    const body = await req.json().catch(() => ({}));
    const { chainId = "42161", sellToken, buyToken, sellAmount, slippagePct } = body;

    if (!sellToken || !buyToken || !sellAmount) {
      return NextResponse.json({ ok: false, error: "Missing required quote parameters" }, { status: 400 });
    }

    const quote = await getDexSwapQuote({
      chainId,
      sellToken,
      buyToken,
      sellAmount,
      slippagePct,
    });

    return NextResponse.json({
      ok: true,
      quote,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
