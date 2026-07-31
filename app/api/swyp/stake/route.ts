/**
 * Staking SWYP.
 *   GET  — stake-urile mele + statistici (total stacat, stakeri, APY-uri)
 *   POST — { action: "stake", amountSwyp, termMonths } | { action: "withdraw_early", stakeId }
 */
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { dbQuery } from "@/lib/db";
import { createStake, withdrawEarly, getStakingOverview, type StakeTerm } from "@/lib/swyp/staking";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async () => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  const overview = await getStakingOverview(session.userId);
  const { rows } = await dbQuery<{ value: Record<string, number> }>(
    `SELECT value FROM platform_config WHERE key = 'swyp_staking_apy_bps'`,
  );
  return NextResponse.json({ success: true, ...overview, apyBps: rows[0]?.value ?? {} });
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit("swypStake", session.userId);
  if (!limited.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

  const body = await req.json().catch(() => ({}));

  if (body?.action === "stake") {
    const amountSwyp = Number(body?.amountSwyp);
    const term = Number(body?.termMonths) as StakeTerm;
    if (!Number.isFinite(amountSwyp) || amountSwyp < 1) {
      return NextResponse.json({ success: false, error: "invalid_amount" }, { status: 400 });
    }
    const result = await createStake(session.userId, BigInt(Math.round(amountSwyp * 100)), term);
    if (!result.ok) return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    return NextResponse.json({ success: true, ...result });
  }

  if (body?.action === "withdraw_early") {
    const ok = await withdrawEarly(session.userId, String(body?.stakeId ?? ""));
    return ok
      ? NextResponse.json({ success: true })
      : NextResponse.json({ success: false, error: "stake_not_found" }, { status: 404 });
  }

  return NextResponse.json({ success: false, error: "invalid_action" }, { status: 400 });
});
