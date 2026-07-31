/**
 * Battle lifecycle cron: closes battles whose ends_at has passed, picks
 * the winning option (highest vote_count, ties broken by earliest first
 * vote), awards XP + Swyp Coins to the winning option's voters, and emits
 * 'battle_overtaken' / 'bounty_won' notifications.
 *
 * Idempotent: only acts on rows where status='active' AND ends_at < now().
 *
 * Trigger: GitHub Actions / external cron every 5 minutes.
 *   POST /api/cron/battles/close
 *   Header: x-cron-secret: $CRON_SECRET
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";


async function authorize(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

type Battle = {
  id: string;
  author_user_id: string;
  title: string;
  vote_count: number;
};

type Winner = {
  post_id: string;
  option_key: string;
  votes: number;
};

export async function POST(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = { closed: 0, authorsAwarded: 0, votersAwarded: 0, notifications: 0, errors: [] as string[] };

  try {
    // Pick up to 50 expired active battles per run.
    const { rows: expired } = await dbQuery<Battle>(
      `SELECT id::text, author_user_id::text, title, vote_count
         FROM community_posts
        WHERE format = 'battle'
          AND status = 'active'
          AND ends_at IS NOT NULL
          AND ends_at < now()
        ORDER BY ends_at ASC
        LIMIT 50`,
    );

    for (const b of expired) {
      try {
        // Pick the winning option (highest vote_count, then earliest item position).
        const { rows: winnerRows } = await dbQuery<Winner>(
          `SELECT post_id::text, option_key, vote_count AS votes
             FROM community_post_items
            WHERE post_id = $1
            ORDER BY vote_count DESC, position ASC
            LIMIT 1`,
          [b.id],
        );

        if (winnerRows.length === 0 || winnerRows[0].votes === 0) {
          // No votes — close silently, no rewards.
          await dbQuery(`UPDATE community_posts SET status = 'closed' WHERE id = $1`, [b.id]);
          summary.closed += 1;
          continue;
        }

        const winner = winnerRows[0];

        // Mark closed and stamp winner in metadata.
        await dbQuery(
          `UPDATE community_posts
              SET status = 'closed',
                  metadata = metadata || jsonb_build_object('winner_option', $2::text, 'winner_votes', $3::int, 'closed_at', to_jsonb(now()))
            WHERE id = $1`,
          [b.id, winner.option_key, winner.votes],
        );
        summary.closed += 1;

        // XP/coins rewards removed together with the points system.
        summary.authorsAwarded += 1;

        await dbQuery(
          `INSERT INTO notifications(user_id, kind, title, body, ref_type, ref_id, cta_url)
                VALUES ($1, 'bounty_won', $2, $3, 'post', $4, $5)`,
          [b.author_user_id, "Battle-ul tău s-a închis", `${b.title} — opțiunea câștigătoare: ${winner.option_key.toUpperCase()} (${winner.votes} voturi)`, b.id, `/arena/${b.id}`],
        );
        summary.notifications += 1;

        // Count winning voters (rewards removed; kept for notifications/metrics).
        const { rows: voters } = await dbQuery<{ user_id: string }>(
          `SELECT user_id::text FROM community_post_votes
            WHERE post_id = $1 AND option_key = $2`,
          [b.id, winner.option_key],
        );
        summary.votersAwarded += voters.length;

        // Notify losers — "ai fost depășit"
        const { rows: losers } = await dbQuery<{ user_id: string; option_key: string }>(
          `SELECT user_id::text, option_key FROM community_post_votes
            WHERE post_id = $1 AND option_key <> $2`,
          [b.id, winner.option_key],
        );
        for (const l of losers) {
          await dbQuery(
            `INSERT INTO notifications(user_id, kind, title, body, ref_type, ref_id, cta_url)
                  VALUES ($1, 'battle_overtaken', $2, $3, 'post', $4, $5)`,
            [l.user_id, "Ai fost depășit", `${b.title} — ${winner.option_key.toUpperCase()} a câștigat cu ${winner.votes} voturi.`, b.id, `/arena/${b.id}`],
          );
        }
        summary.notifications += losers.length;
      } catch (errBattle) {
        summary.errors.push(`${b.id}: ${(errBattle as Error).message}`);
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message, ...summary }, { status: 500 });
  }
}
