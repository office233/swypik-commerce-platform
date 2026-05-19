/**
 * Lazy upsert of a thin user record into adult.users_mirror.
 *
 * Source of truth for users remains the swypik DB (public.users). This
 * helper exists so that admin/creator views inside /adult/* can read an
 * email without a cross-DB round-trip on every render. Called on:
 *   - first successful viewer access grant
 *   - creator KYC submission
 *   - any admin action that targets the user
 */

import { adultQuery } from "./db";

export interface UserMirrorRecord {
  userId: string;
  email?: string | null;
  role?: string | null;
}

export async function upsertUserMirror(rec: UserMirrorRecord): Promise<void> {
  if (!rec.userId) return;
  try {
    await adultQuery(
      `INSERT INTO adult.users_mirror (user_id, email, role, mirrored_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, adult.users_mirror.email),
         role  = COALESCE(EXCLUDED.role,  adult.users_mirror.role),
         updated_at = now()`,
      [rec.userId, rec.email ?? null, rec.role ?? null],
    );
  } catch (err) {
    console.warn("[adult-db] users_mirror upsert failed:", (err as Error).message);
  }
}
