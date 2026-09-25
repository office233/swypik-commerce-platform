/**
 * GET /api/shop/products?q=&category=&sort=&minPrice=&maxPrice=&cursor=&limit=&locale=
 * → { items, nextCursor } — catalogul magazinului cu paginare pe cursor.
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { listCatalog } from "@/lib/shop/catalog";
import { CatalogQuerySchema } from "@/lib/shop/schemas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = await rateLimit("products", getClientIP(req));
  if (!rl.success) return NextResponse.json({ code: "rate_limited" }, { status: 429 });

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = CatalogQuerySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ code: "validation_error" }, { status: 400 });
  const locale = isLocale(raw.locale) ? raw.locale : DEFAULT_LOCALE;

  try {
    const page = await listCatalog({ ...parsed.data, locale });
    return NextResponse.json(page, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (err) {
    logger.error({ err }, "[shop.products] list failed");
    return NextResponse.json({ code: "internal" }, { status: 500 });
  }
}
