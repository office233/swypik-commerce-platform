/**
 * Calendar disponibilitate cazări — gazda blochează/deblochează zile
 * și setează prețuri sezoniere (override pe zi).
 *
 * POST /api/stays/availability { product_id, days: [{ day, is_available, price_cents_override? }] }
 *   Auth: sellerul proprietar al produsului (seller session).
 * GET  /api/stays/availability?product_id=&from=&to= → calendarul (public).
 */
import { NextResponse } from "next/server";
import { dbQuery, withTransaction } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { StayAvailabilitySchema, parseBody } from "@/lib/validation/schemas";
import { withErrorHandling } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function GET_impl(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const productId = url.searchParams.get("product_id")?.trim();
  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
    return NextResponse.json({ success: false, error: "product_id invalid" }, { status: 400 });
  }
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();

  const where: string[] = ["product_id = $1"];
  const params: unknown[] = [productId];
  if (from && DATE_RE.test(from)) {
    params.push(from);
    where.push(`day >= $${params.length}`);
  }
  if (to && DATE_RE.test(to)) {
    params.push(to);
    where.push(`day <= $${params.length}`);
  }

  const { rows } = await dbQuery(
    `SELECT day, is_available, price_cents_override
       FROM stay_availability
      WHERE ${where.join(" AND ")}
      ORDER BY day ASC
      LIMIT 400`,
    params,
  );
  return NextResponse.json({ success: true, days: rows });
}

async function POST_impl(req: Request): Promise<Response> {
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit("sellerProducts", `stayavail:${sellerId}`);
  if (!rl.success) {
    return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = parseBody(StayAvailabilitySchema, body);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error, issues: parsed.issues }, { status: 400 });
  }
  const { product_id, days } = parsed.data;

  // Ownership: produsul trebuie să aparțină sellerului.
  const { rows: pRows } = await dbQuery<{ id: string }>(
    `SELECT id FROM marketplace_products WHERE id = $1 AND seller_id = $2`,
    [product_id, sellerId],
  );
  if (pRows.length === 0) {
    return NextResponse.json({ success: false, error: "Produsul nu există sau nu îți aparține." }, { status: 404 });
  }

  await withTransaction(async (q) => {
    for (const d of days) {
      await q(
        `INSERT INTO stay_availability (product_id, day, is_available, price_cents_override)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, day)
         DO UPDATE SET is_available = EXCLUDED.is_available,
                       price_cents_override = EXCLUDED.price_cents_override`,
        [product_id, d.day, d.is_available, d.price_cents_override ?? null],
      );
    }
  });

  logger.info({ sellerId, product_id, count: days.length }, "[stays] availability updated");
  return NextResponse.json({ success: true, updated: days.length });
}

export const GET = withErrorHandling(GET_impl);
export const POST = withErrorHandling(POST_impl);
