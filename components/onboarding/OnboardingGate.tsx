import { headers } from "next/headers";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { dbQuery } from "@/lib/db";
import OnboardingModal, { type SuggestedCreator } from "./OnboardingModal";

const SWYPIK_OFFICIAL_ID = "bf3ba871-b369-4669-b7f9-2e0ab5eecebe";

type Row = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  follower_count: string;
  is_verified: boolean | null;
};

async function loadSuggested(userId: string): Promise<SuggestedCreator[]> {
  const { rows } = await dbQuery<Row>(
    `SELECT u.id,
            u.username,
            COALESCE(cp.display_name, u.display_name) AS display_name,
            COALESCE(cp.avatar_url, u.avatar_url) AS avatar_url,
            COALESCE(cp.bio, u.bio) AS bio,
            (SELECT COUNT(*) FROM follows f WHERE f.following_user_id = u.id) AS follower_count,
            (cp.verification_status = 'verified' OR u.is_verified) AS is_verified
       FROM users u
       LEFT JOIN creator_profiles cp ON cp.user_id = u.id
      WHERE u.id <> $1
        AND u.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM follows f
           WHERE f.follower_user_id = $1 AND f.following_user_id = u.id
        )
      ORDER BY (u.id = $2) DESC,
               (cp.id IS NOT NULL) DESC,
               (SELECT COUNT(*) FROM follows f WHERE f.following_user_id = u.id) DESC,
               u.created_at ASC
      LIMIT 10`,
    [userId, SWYPIK_OFFICIAL_ID],
  );

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    followerCount: parseInt(r.follower_count || "0", 10),
    isVerified: Boolean(r.is_verified),
  }));
}

export default async function OnboardingGate() {
  const auth = await getAuthUser();
  if (!auth.userId) return null;

  // Suppress on auth pages where the modal would be disorienting.
  try {
    const h = await headers();
    const path = h.get("x-invoke-path") || h.get("x-pathname") || "";
    if (path.startsWith("/auth")) return null;
  } catch {
    /* ignore */
  }

  const { rows } = await dbQuery<{ onboarding_completed_at: string | null }>(
    `SELECT onboarding_completed_at FROM users WHERE id = $1 LIMIT 1`,
    [auth.userId],
  );

  if (!rows[0]) return null;
  if (rows[0].onboarding_completed_at) return null;

  let creators: SuggestedCreator[] = [];
  try {
    creators = await loadSuggested(auth.userId);
  } catch {
    creators = [];
  }

  return <OnboardingModal initialCreators={creators} />;
}
