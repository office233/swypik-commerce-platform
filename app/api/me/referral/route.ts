import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getOrCreateReferralCode } from "@/lib/referral/attribution";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

function siteBase(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const code = await getOrCreateReferralCode(auth.userId);
  const stats = await dbQuery<{
    total_invited: number;
    total_validated: number;
  }>(
    `SELECT total_invited, total_validated FROM referral_codes WHERE user_id = $1`,
    [auth.userId],
  );
  const row = stats.rows[0];
  return NextResponse.json({
    code,
    shareUrl: `${siteBase(req)}/r/${code}`,
    totalInvited: row?.total_invited ?? 0,
    totalValidated: row?.total_validated ?? 0,
  });
}

export async function POST(req: Request) {
  return GET(req);
}
