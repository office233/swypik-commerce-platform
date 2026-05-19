/**
 * POST /api/adult/ppv/start
 * { postId }
 *
 * Production: 503 until CCBill wired.
 * Dev: inserts a manual_test ppv_unlocks row.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";
import { upsertUserMirror } from "@/lib/adult/userMirror";
import { ccbillConfigured } from "@/lib/adult/providers/ccbill";

export const dynamic = "force-dynamic";

interface Body { postId?: string }

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: Body;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (!b.postId || !/^[0-9a-f-]{36}$/i.test(b.postId)) {
    return NextResponse.json({ error: "bad_postId" }, { status: 400 });
  }

  const { rows } = await adultQuery<{
    creator_user_id: string; price_minor: number; currency: string;
    requires_subscription: boolean; status: string;
  }>(
    `SELECT creator_user_id::text, price_minor, currency,
            requires_subscription, status
       FROM adult.posts WHERE id = $1`,
    [b.postId],
  );
  const post = rows[0];
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (post.status !== "active") return NextResponse.json({ error: "post_not_active" }, { status: 409 });
  if (post.requires_subscription) return NextResponse.json({ error: "subscription_only" }, { status: 409 });
  if (post.price_minor <= 0) return NextResponse.json({ error: "post_is_free" }, { status: 409 });
  if (post.creator_user_id === user.userId) return NextResponse.json({ error: "own_post" }, { status: 409 });

  void upsertUserMirror({ userId: user.userId, email: (user as any).email ?? null, role: (user as any).role ?? null });

  if (ccbillConfigured()) {
    return NextResponse.json({ error: "not_implemented", message: "CCBill FlexForm wiring pending." }, { status: 501 });
  }
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const ref = `manual_ppv_${crypto.randomBytes(8).toString("hex")}`;
  await adultQuery(
    `INSERT INTO adult.ppv_unlocks
       (fan_user_id, post_id, paid_minor, currency, processor, processor_ref)
     VALUES ($1,$2,$3,$4,'manual_test',$5)
     ON CONFLICT (fan_user_id, post_id) DO NOTHING`,
    [user.userId, b.postId, post.price_minor, post.currency, ref],
  );
  return NextResponse.json({
    stub: true,
    hostedUrl: `/adult/checkout/manual?type=ppv&ref=${ref}`,
    processorRef: ref,
  });
}
