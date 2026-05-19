/**
 * POST /api/adult/tips/start
 * { creatorUserId, postId?, amountMinor, currency, message? }
 *
 * Production: 503. Dev: inserts manual_test tip row.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";
import { upsertUserMirror } from "@/lib/adult/userMirror";
import { ccbillConfigured } from "@/lib/adult/providers/ccbill";

export const dynamic = "force-dynamic";

interface Body { creatorUserId?: string; postId?: string | null; amountMinor?: number; currency?: string; message?: string | null }

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (!b.creatorUserId || !/^[0-9a-f-]{36}$/i.test(b.creatorUserId)) {
    return NextResponse.json({ error: "bad_creator" }, { status: 400 });
  }
  const amount = Math.max(100, Math.floor(Number(b.amountMinor || 0)));
  if (amount > 1_000_00) return NextResponse.json({ error: "amount_too_large" }, { status: 400 });
  const currency = (b.currency || "EUR").toUpperCase();
  if (!["EUR", "USD", "GBP"].includes(currency)) return NextResponse.json({ error: "bad_currency" }, { status: 400 });

  void upsertUserMirror({ userId: user.userId, email: (user as any).email ?? null, role: (user as any).role ?? null });

  if (ccbillConfigured()) {
    return NextResponse.json({ error: "not_implemented", message: "CCBill FlexForm wiring pending." }, { status: 501 });
  }
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const ref = `manual_tip_${crypto.randomBytes(8).toString("hex")}`;
  await adultQuery(
    `INSERT INTO adult.tips
       (fan_user_id, creator_user_id, post_id, amount_minor, currency,
        processor, processor_ref, message)
     VALUES ($1,$2,$3,$4,$5,'manual_test',$6,$7)`,
    [user.userId, b.creatorUserId, b.postId ?? null, amount, currency, ref, b.message ?? null],
  );
  return NextResponse.json({
    stub: true,
    hostedUrl: `/adult/checkout/manual?type=tip&ref=${ref}`,
    processorRef: ref,
  });
}
