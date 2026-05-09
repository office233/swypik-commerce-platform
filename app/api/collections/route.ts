/**
 * DEPRECATED — Legacy Shopify Collections endpoint
 * 
 * Categories now come from Neon (ae_categories) via /api/products?hierarchy=true
 * or via getCategories() from lib/db/product-queries.
 * 
 * This endpoint is kept as a stub to avoid 404s from old clients.
 * Will be removed in a future cleanup sprint.
 */

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const adminSecret = process.env.ADMIN_DEBUG_SECRET;
  const providedSecret = req.headers.get("x-admin-secret");

  if (isProduction && (!adminSecret || providedSecret !== adminSecret)) {
    return NextResponse.json(
      {
        error: "This endpoint is deprecated. Categories are served from /api/products.",
        deprecated: true,
      },
      { status: 410 }
    );
  }

  // Dev: return empty but with deprecation warning
  return NextResponse.json({
    collections: [],
    deprecated: true,
    message: "Use getCategories() from lib/db/product-queries instead.",
  });
}
