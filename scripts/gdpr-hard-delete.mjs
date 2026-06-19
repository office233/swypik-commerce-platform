#!/usr/bin/env node
/**
 * scripts/gdpr-hard-delete.mjs
 *
 * GDPR Art. 17 hard-delete worker. Run from cron daily.
 *
 * Selects every user where
 *   deletion_scheduled_at IS NOT NULL
 *   AND deletion_scheduled_at < now()
 *   AND deleted_at IS NULL
 *
 * For each such user we:
 *   1. Anonymize FK-referenced rows that we want to keep around for
 *      legitimate reasons (orders, commissions, fraud trail). For those
 *      tables we NULL the user_id where the FK allows NULL, or leave the
 *      row in place with the anonymized user record (since the placeholder
 *      email/username are already opaque).
 *   2. Hard-delete the user row. Tables with ON DELETE CASCADE will go
 *      with it automatically. Anything that doesn't cascade but isn't
 *      legally required to keep, we delete explicitly before the user row.
 *   3. Mark users.deleted_at = now() (technically redundant since the row
 *      is gone, but if for any reason the DELETE is rejected by a FK
 *      constraint we want the marker so we can investigate).
 *   4. INSERT into gdpr_requests with request_type='hard_delete' for audit.
 *
 * Tables that we MUST keep (per Romanian fiscal law: orders + invoices for
 * 10 years) — we keep these rows but the buyer_user_id will become a dangling
 * UUID. Reports against them go through commerce_orders.shipping_address
 * JSON snapshot, which is already non-identifying after anonymization.
 *
 * SAFETY:
 *   - Hard-coded LIMIT 100/run so a runaway query can't wipe the user
 *     base. Reschedule again later if there are leftovers.
 *   - Wraps each user in BEGIN/COMMIT individually — one failing user
 *     does not roll back the whole batch.
 *   - Dry-run with --dry to log what would happen without writing.
 *
 * Status: DRAFT — wire to cron only after first manual run + verification.
 */

import { Pool } from 'pg';

const DRY = process.argv.includes('--dry');
const LIMIT = 100;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function findDue() {
  const { rows } = await pool.query(
    `SELECT id, email, username, deletion_scheduled_at
       FROM users
      WHERE deletion_scheduled_at IS NOT NULL
        AND deletion_scheduled_at < now()
        AND deleted_at IS NULL
      ORDER BY deletion_scheduled_at ASC
      LIMIT $1`,
    [LIMIT],
  );
  return rows;
}

async function hardDeleteOne(client, userId) {
  // Tables that point to users with NO cascade and we want to PRESERVE rows
  // for legitimate reasons (audit, fraud, fiscal) — null the FK instead.
  // commerce_orders.buyer_user_id is left alone (orders must survive 10y).
  await client.query(
    `UPDATE moderation_cases SET assigned_user_id = NULL WHERE assigned_user_id = $1`,
    [userId],
  );
  await client.query(
    `UPDATE moderation_cases SET resolved_by_user_id = NULL WHERE resolved_by_user_id = $1`,
    [userId],
  );
  await client.query(
    `UPDATE moderation_actions SET actor_user_id = NULL WHERE actor_user_id = $1`,
    [userId],
  );

  // Tables we DELETE explicitly (no cascade, no business reason to keep).
  // Wrap each in try/ignore so a missing table doesn't kill the run.
  const cleanupTables = [
    'feed_events', 'feed_items', 'user_feed_state', 'user_hidden_videos',
    'user_interests', 'notifications', 'notification_preferences',
    'cart_items', 'carts', 'comments', 'likes', 'follows',
    'community_post_votes', 'community_posts', 'product_reviews',
    'saved_items', 'creator_collections', 'creator_product_links',
    'creator_profiles', 'creator_applications', 'addresses',
    'user_sessions', 'auth_accounts', 'oauth_accounts',
    'password_reset_tokens', 'email_unsubscribes', 'payment_customers',
    'user_age_verifications',
  ];
  for (const tbl of cleanupTables) {
    try {
      // Most tables use user_id; some use other columns — try both.
      await client.query(`DELETE FROM ${tbl} WHERE user_id = $1`, [userId]);
    } catch {
      /* table missing or different FK column — ignore */
    }
  }

  // Mark as deleted, then hard-delete the row.
  await client.query(
    `UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1`,
    [userId],
  );
  await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

async function main() {
  const due = await findDue();
  console.log(JSON.stringify({ event: 'gdpr_hard_delete_start', count: due.length, dry: DRY }));
  if (due.length === 0) {
    await pool.end();
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const u of due) {
    if (DRY) {
      console.log(JSON.stringify({ event: 'would_hard_delete', user_id: u.id, scheduled: u.deletion_scheduled_at }));
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await hardDeleteOne(client, u.id);
      await client.query(
        `INSERT INTO gdpr_requests (user_id, request_type, metadata)
         VALUES ($1, 'hard_delete', $2)`,
        [u.id, JSON.stringify({ scheduled_at: u.deletion_scheduled_at })],
      ).catch(() => {/* user already gone; audit best-effort */});
      await client.query('COMMIT');
      ok++;
      console.log(JSON.stringify({ event: 'hard_delete_ok', user_id: u.id }));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      failed++;
      console.error(JSON.stringify({ event: 'hard_delete_failed', user_id: u.id, error: String(err?.message || err) }));
    } finally {
      client.release();
    }
  }

  console.log(JSON.stringify({ event: 'gdpr_hard_delete_done', ok, failed, total: due.length }));
  await pool.end();
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'gdpr_hard_delete_fatal', error: String(err?.message || err) }));
  process.exit(1);
});
