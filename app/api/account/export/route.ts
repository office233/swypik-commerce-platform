/**
 * GET /api/account/export
 *
 * GDPR Art. 20 — Right to Data Portability.
 * Returns a JSON blob with every piece of personal data we hold for the
 * authenticated user. Triggered as a download (Content-Disposition).
 *
 * Synchronous on purpose: most users have < 10MB of data. If a user ever
 * exceeds the threshold we'll add an async job + email link, but YAGNI
 * until that happens.
 *
 * Logged in gdpr_requests for audit (Art. 5(2) "accountability").
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Safely fetch rows; if a table doesn't exist for some reason (schema drift)
// we return an empty array rather than 500.
async function safeQuery(sql: string, params: any[] = []): Promise<any[]> {
  try {
    const { rows } = await dbQuery(sql, params);
    return rows;
  } catch (err) {
    return [{ _error: String(err instanceof Error ? err.message : err).slice(0, 200) }];
  }
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = auth.userId;

  // Audit log first — if the rest fails the request was still recorded.
  try {
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || null;
    const ua = req.headers.get("user-agent") || null;
    await dbQuery(
      `INSERT INTO gdpr_requests (user_id, request_type, ip_address, user_agent)
       VALUES ($1, 'export', $2, $3)`,
      [userId, ip, ua],
    );
  } catch {
    // Audit failure should not block the export itself.
  }

  // Pull every table that has a foreign key to users.id (or stores
  // user-attributable data). Keep the SELECTs explicit so we never leak
  // fields we didn't intend (e.g. password_hash).
  const [
    user,
    sessions,
    creatorProfile,
    addresses,
    orders,
    orderItems,
    cartItems,
    likes,
    follows_following,
    follows_followers,
    saved,
    reviews,
    comments,
    notificationPrefs,
    feedHidden,
    ageVerification,
    consentLog,
    gdprHistory,
  ] = await Promise.all([
    safeQuery(
      `SELECT id, email, username, display_name, bio, avatar_url, role, status,
              birth_date, age_verification_status, adult_content_opt_in,
              email_verified_at, created_at, updated_at, last_login_at
         FROM users WHERE id = $1`,
      [userId],
    ),
    safeQuery(
      `SELECT id, created_at, expires_at, revoked_at, ip_address, user_agent
         FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    ),
    safeQuery(`SELECT * FROM creator_profiles WHERE user_id = $1`, [userId]),
    safeQuery(`SELECT * FROM addresses WHERE user_id = $1`, [userId]),
    safeQuery(
      `SELECT id, total_cents, currency, status, created_at, updated_at, shipping_address
         FROM commerce_orders WHERE buyer_user_id = $1 ORDER BY created_at DESC`,
      [userId],
    ),
    safeQuery(
      `SELECT oi.* FROM commerce_order_items oi
         JOIN commerce_orders o ON o.id = oi.order_id
        WHERE o.buyer_user_id = $1`,
      [userId],
    ),
    safeQuery(
      `SELECT ci.* FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
        WHERE c.user_id = $1`,
      [userId],
    ),
    safeQuery(`SELECT video_id, created_at FROM likes WHERE user_id = $1`, [userId]),
    safeQuery(
      `SELECT following_user_id AS following, created_at FROM follows WHERE follower_user_id = $1`,
      [userId],
    ),
    safeQuery(
      `SELECT follower_user_id AS follower, created_at FROM follows WHERE following_user_id = $1`,
      [userId],
    ),
    safeQuery(`SELECT * FROM saved_items WHERE user_id = $1`, [userId]),
    safeQuery(
      `SELECT id, product_id, rating, body, created_at FROM product_reviews WHERE user_id = $1`,
      [userId],
    ),
    safeQuery(
      `SELECT id, video_id, body, created_at FROM comments WHERE user_id = $1 LIMIT 1000`,
      [userId],
    ),
    safeQuery(`SELECT * FROM notification_preferences WHERE user_id = $1`, [userId]),
    safeQuery(`SELECT video_id, created_at FROM user_hidden_videos WHERE user_id = $1`, [userId]),
    safeQuery(`SELECT * FROM user_age_verifications WHERE user_id = $1`, [userId]),
    safeQuery(`SELECT * FROM email_unsubscribes WHERE user_id = $1`, [userId]),
    safeQuery(
      `SELECT request_type, ip_address, user_agent, created_at FROM gdpr_requests WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    ),
  ]);

  const payload = {
    export_generated_at: new Date().toISOString(),
    export_format_version: 1,
    notice:
      "This file contains all personal data Swypik holds about you (GDPR Art. 20). " +
      "Please store it safely. To request deletion, see /account/settings.",
    user: user[0] || null,
    sessions,
    creator_profile: creatorProfile[0] || null,
    addresses,
    orders,
    order_items: orderItems,
    cart_items: cartItems,
    likes,
    following: follows_following,
    followers: follows_followers,
    saved_items: saved,
    product_reviews: reviews,
    video_comments: comments,
    notification_preferences: notificationPrefs[0] || null,
    feed_hidden_videos: feedHidden,
    age_verification: ageVerification[0] || null,
    email_unsubscribes: consentLog,
    gdpr_request_history: gdprHistory,
  };

  const filename = `swypik-data-export-${userId}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
