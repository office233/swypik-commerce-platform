import { dbQuery } from "@/lib/db";
import { getOptionalSocialUserId } from "@/lib/social/session";
import ChallengesClient from "./ChallengesClient";

export const dynamic = "force-dynamic";

type ChallengeRow = {
  id: string;
  title: string;
  description: string | null;
  challenge_type: string;
  topic: string | null;
  reward_points: number;
  max_entries: number | null;
  starts_at: string;
  ends_at: string;
  status: string;
  featured: boolean;
  banner_url: string | null;
};

type EntryRow = { challenge_id: string; status: string; score: string };
type LeaderRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  lifetime_earned: string;
};

export default async function ChallengesPage() {
  const userId = await getOptionalSocialUserId();

  const challengesRes = await dbQuery<ChallengeRow>(
    `SELECT id, title, description, challenge_type, topic, reward_points,
            max_entries, starts_at, ends_at, status, featured, banner_url
       FROM daily_challenges
      WHERE status = 'active' AND ends_at > NOW()
      ORDER BY featured DESC, created_at DESC
      LIMIT 50`
  );

  let entries: EntryRow[] = [];
  if (userId) {
    const entriesRes = await dbQuery<EntryRow>(
      `SELECT challenge_id, status, score::text AS score
         FROM challenge_entries
        WHERE user_id = $1`,
      [userId]
    );
    entries = entriesRes.rows;
  }

  const leaderboardRes = await dbQuery<LeaderRow>(
    `SELECT w.user_id,
            u.username,
            u.display_name,
            u.avatar_url,
            w.lifetime_earned::text AS lifetime_earned
       FROM swyp_wallets w
       JOIN users u ON u.id = w.user_id
      ORDER BY w.lifetime_earned DESC
      LIMIT 10`
  );

  return (
    <ChallengesClient
      challenges={challengesRes.rows}
      entries={entries}
      leaderboard={leaderboardRes.rows}
      isLoggedIn={!!userId}
    />
  );
}
