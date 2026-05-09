/**
 * DEPRECATED — Legacy Shopify Products endpoint
 * 
 * This endpoint is superseded by /api/products (Neon-backed).
 * It remains for admin/debug purposes only and is blocked in production
 * unless the correct admin secret header is provided.
 * 
 * Will be removed in a future cleanup sprint.
 */

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  // Block in production — Neon is the canonical product source
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const adminSecret = process.env.ADMIN_DEBUG_SECRET;
  const providedSecret = req.headers.get("x-admin-secret");

  if (isProduction && (!adminSecret || providedSecret !== adminSecret)) {
    return NextResponse.json(
      {
        error: "This endpoint is deprecated. Use /api/products instead.",
        redirect: "/api/products",
        deprecated: true,
      },
      { status: 410 } // 410 Gone
    );
  }

  // Dev mode: redirect to the correct endpoint
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use /api/products instead.",
      redirect: "/api/products",
      deprecated: true,
    },
    { status: 301 }
  );
}
