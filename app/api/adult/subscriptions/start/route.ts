/**
 * POST /api/adult/subscriptions/start
 * { creatorUserId, tierMinor, currency }
 *
 * Production: returns 503 until a CCBill FlexForm is configured
 * (CCBILL_ACCOUNT_NUMBER, CCBILL_SUB_ACCOUNT, CCBILL_FLEXFORM_ID).
 * Dev: inserts a manual_test subscription row and returns a fake URL.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";
import { upsertUserMirror } from "@/lib/adult/userMirror";
import { ccbillConfigured } from "@/lib/adult/providers/ccbill";

export const dynamic = "force-dynamic";

interface Body { creatorUserId?: string; tierMinor?: number; currency?: string }

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (!b.creatorUserId || !/^[0-9a-f-]{36}$/i.test(b.creatorUserId)) {
    return NextResponse.json({ error: "bad_creator" }, { status: 400 });
  }
  const tier = Math.max(100, Math.floor(Number(b.tierMinor || 0)));
  const currency = (b.currency || "EUR").toUpperCase();
  if (!["EUR", "USD", "GBP"].includes(currency)) return NextResponse.json({ error: "bad_currency" }, { status: 400 });

  void upsertUserMirror({ userId: user.userId, email: (user as any).email ?? null, role: (user as any).role ?? null });

  if (ccbillConfigured()) {
    // FlexForm URL construction would go here. We don't have the
    // account merchant ID + form ID until commercial onboarding completes.
    return NextResponse.json({ error: "not_implemented", message: "CCBill FlexForm wiring pending." }, { status: 501 });
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const ref = `manual_sub_${crypto.randomBytes(8).toString("hex")}`;
  await adultQuery(
    `INSERT INTO adult.subscriptions
       (fan_user_id, creator_user_id, tier_minor, currency,
        processor, processor_subscription_ref, current_period_end, status)
     VALUES ($1,$2,$3,$4,'manual_test',$5, now() + INTERVAL '30 days', 'active')
     ON CONFLICT (fan_user_id, creator_user_id, processor_subscription_ref) DO NOTHING`,
    [user.userId, b.creatorUserId, tier, currency, ref],
  );
  return NextResponse.json({
    stub: true,
    hostedUrl: `/adult/checkout/manual?type=sub&ref=${ref}`,
    processorRef: ref,
  });
}
