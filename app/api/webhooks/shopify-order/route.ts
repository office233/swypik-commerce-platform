/**
 * DEPRECATED — Shopify order webhook replaced by Stripe webhook
 * See /api/webhooks/stripe/route.ts
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ status: "deprecated — use Stripe webhook" }, { status: 410 });
}
