import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getOrCreateSocialUser } from "@/lib/social/session";
import { logger } from "@/lib/logger";
import { UUID_RE } from "@/lib/validation/uuid";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const CHANNELS = new Set([
  "copy_link", "native_share", "email", "sms", "whatsapp",
  "facebook", "instagram", "tiktok", "x", "other",
]);

/** POST /api/products/[id]/share — înregistrează un share pe produs (anon OK). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;
    if (!UUID_RE.test(productId)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const { userId } = await getOrCreateSocialUser();
    const rl = await rateLimit("videoLike", userId);
    if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    let channel = "other";
    try {
      const body = await request.json();
      if (typeof body?.channel === "string" && CHANNELS.has(body.channel)) {
        channel = body.channel;
      }
    } catch {
      /* body optional */
    }

    const pool = getDb();
    const client = await pool.connect();
    let shareCount = 0;
    try {
      await client.query("BEGIN");

      const exists = await client.query(
        "SELECT id FROM marketplace_products WHERE id = $1",
        [productId]
      );
      if (!exists.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }

      await client.query(
        "INSERT INTO shares (user_id, product_id, channel) VALUES ($1, $2, $3)",
        [userId, productId, channel]
      );

      const stats = await client.query(
        `INSERT INTO product_stats (product_id, share_count, updated_at)
         VALUES ($1, 1, now())
         ON CONFLICT (product_id) DO UPDATE
           SET share_count = product_stats.share_count + 1,
               updated_at = now()
         RETURNING share_count`,
        [productId]
      );
      shareCount = Number(stats.rows[0]?.share_count) || 0;

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ shared: true, shareCount });
  } catch (error) {
    logger.error({ error: String(error) }, "product share failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
