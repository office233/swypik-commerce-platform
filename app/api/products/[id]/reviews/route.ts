import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/security/rate-limit";
import { ProductReviewCreateSchema, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  is_verified_purchase: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  user_display_name: string | null;
  user_username: string | null;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!productId || !UUID_RE.test(productId)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }
    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10) || 10));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const sort = url.searchParams.get("sort") === "helpful" ? "helpful" : "recent";

    const orderClause =
      sort === "helpful" ? "r.helpful_count DESC, r.created_at DESC" : "r.created_at DESC";

    const { rows } = await dbQuery<ReviewRow>(
      `SELECT r.id, r.product_id, r.user_id, r.order_id, r.rating, r.title, r.body,
              r.is_verified_purchase, r.helpful_count, r.created_at, r.updated_at,
              u.display_name AS user_display_name, u.username AS user_username
         FROM product_reviews r
         JOIN users u ON u.id = r.user_id
        WHERE r.product_id = $1 AND r.is_hidden = false
        ORDER BY ${orderClause}
        LIMIT $2 OFFSET $3`,
      [productId, limit + 1, offset]
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const { rows: aggRows } = await dbQuery<{ avg_rating: string | null; total: string }>(
      `SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::text AS total
         FROM product_reviews
        WHERE product_id = $1 AND is_hidden = false`,
      [productId]
    );

    const agg = aggRows[0] || { avg_rating: null, total: "0" };

    return NextResponse.json({
      items: items.map((r) => ({
        id: r.id,
        productId: r.product_id,
        userId: r.user_id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        isVerifiedPurchase: r.is_verified_purchase,
        helpfulCount: r.helpful_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        user: {
          displayName: r.user_display_name,
          username: r.user_username,
        },
      })),
      hasMore,
      offset,
      limit,
      aggregate: {
        average: agg.avg_rating ? Number(agg.avg_rating) : null,
        total: Number(agg.total || "0"),
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Reviews GET]");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit("productReviews", session.userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const { id: productId } = await params;
    const UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!productId || !UUID_RE2.test(productId)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }
    const rawBody = await req.json().catch(() => null);
    const parsedBody = parseBody(ProductReviewCreateSchema, rawBody);
    if (!parsedBody.ok) return NextResponse.json({ error: parsedBody.error }, { status: 400 });
    const rating = parsedBody.data.rating;
    const title: string | null = parsedBody.data.title ?? null;
    const text: string | null = parsedBody.data.body ?? null;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
    }

    const { rows: productRows } = await dbQuery<{ id: string }>(
      `SELECT id FROM marketplace_products WHERE id = $1 LIMIT 1`,
      [productId]
    );
    if (!productRows[0]) return NextResponse.json({ error: "product_not_found" }, { status: 404 });

    const { rows: orderRows } = await dbQuery<{ order_id: string }>(
      `SELECT oi.order_id
         FROM commerce_order_items oi
         JOIN commerce_orders o ON o.id = oi.order_id
        WHERE oi.product_id = $1
          AND o.buyer_user_id = $2
          AND o.status IN ('paid','fulfilled')
        ORDER BY o.created_at DESC
        LIMIT 1`,
      [productId, session.userId]
    );

    const orderId = orderRows[0]?.order_id || null;
    const isVerified = !!orderId;

    try {
      const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO product_reviews
           (product_id, user_id, order_id, rating, title, body, is_verified_purchase)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [productId, session.userId, orderId, rating, title, text, isVerified]
      );
      return NextResponse.json({ id: rows[0].id, isVerifiedPurchase: isVerified }, { status: 201 });
    } catch (err: any) {
      if (err?.code === "23505") {
        return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
      }
      throw err;
    }
  } catch (error: any) {
    logger.error({ err: error }, "[Reviews POST]");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
