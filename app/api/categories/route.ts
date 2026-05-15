/**
 * GET /api/categories?locale=ro
 *
 * Public alias for /api/products?hierarchy=true. Returns the category
 * hierarchy used by storefront filters and the chat assistant.
 * Internal callers should prefer /api/products?hierarchy=true.
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const locale = url.searchParams.get("locale") || "ro";
    const { getCategoryHierarchy } = await import("@/lib/db/product-queries");
    const hierarchy = await getCategoryHierarchy(locale);
    return NextResponse.json({ hierarchy });
  } catch (e: any) {
    logger.error({ err: e }, "[Categories API]");
    return NextResponse.json({ error: "err", hierarchy: [] }, { status: 500 });
  }
}
