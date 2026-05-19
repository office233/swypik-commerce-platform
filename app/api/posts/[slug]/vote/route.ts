/**
 * POST /api/posts/[slug]/vote — cast a vote on an Arena post.
 *
 *   Body: { optionKey: string }
 *
 *   Auth user:  persists in community_post_votes (PK = post_id, user_id).
 *               Switching options updates the row (decrements old, increments new).
 *               Awards +5 coins via reward_events (action='arena_vote'), daily cap 10 votes (50 coins).
 *
 *   Anon user:  sets `swypik_anon` cookie if missing, persists in anon_post_votes.
 *               No reward (anon has no wallet); recorded for ledger-at-signup attribution.
 *
 *   Counts:     community_post_items.vote_count + community_posts.vote_count
 *               are mutated transactionally with the vote.
 *
 *   Idempotent for same option; switching deducts from old option and adds to new.
 */
import { NextResponse } from "next/server";
import { dbQuery, getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { getOrCreateAnonId } from "@/lib/anon/session";
import { tryValidateReferral } from "@/lib/referral/attribution";

export const dynamic = "force-dynamic";

const REWARD_ACTION = "arena_vote";
const REWARD_POINTS = 5;
const DAILY_CAP_VOTES = 10; // ⇒ 50 coins/day from voting

type PostRow = { id: string; status: string; is_adult: boolean };
type ItemRow = { option_key: string };
type ExistingVoteRow = { option_key: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug || slug.length > 80) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const optionKey = typeof body?.optionKey === "string" ? body.optionKey.trim() : "";
  if (!optionKey || optionKey.length > 64) {
    return NextResponse.json({ error: "invalid_option_key" }, { status: 400 });
  }

  // Resolve post by slug
  const { rows: postRows } = await dbQuery<PostRow>(
    `SELECT id, status, is_adult FROM community_posts
      WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  const post = postRows[0];
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (post.status !== "active")
    return NextResponse.json({ error: "post_closed" }, { status: 409 });
  if (post.is_adult)
    return NextResponse.json({ error: "adult_blocked" }, { status: 403 });

  // Validate optionKey exists on this post
  const { rows: optRows } = await dbQuery<ItemRow>(
    `SELECT option_key FROM community_post_items WHERE post_id = $1`,
    [post.id],
  );
  if (!optRows.some((r) => r.option_key === optionKey)) {
    return NextResponse.json({ error: "unknown_option" }, { status: 400 });
  }

  const auth = await getAuthUser();
  const userId = auth?.userId ?? null;

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");

    let previousOption: string | null = null;
    let isNew = false;
    let actor: { kind: "user" | "anon"; id: string };

    if (userId) {
      actor = { kind: "user", id: userId };
      const prev = await client.query<ExistingVoteRow>(
        `SELECT option_key FROM community_post_votes
          WHERE post_id=$1 AND user_id=$2 LIMIT 1`,
        [post.id, userId],
      );
      previousOption = prev.rows[0]?.option_key ?? null;
      isNew = previousOption === null;
      if (previousOption === optionKey) {
        await client.query("COMMIT");
        return NextResponse.json(
          { ok: true, optionKey, status: "unchanged", actor: { kind: "user" } },
          { status: 200 },
        );
      }
      await client.query(
        `INSERT INTO community_post_votes (post_id, user_id, option_key, weight)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (post_id, user_id) DO UPDATE
           SET option_key = EXCLUDED.option_key,
               updated_at = now()`,
        [post.id, userId, optionKey],
      );
    } else {
      const anonId = await getOrCreateAnonId();
      actor = { kind: "anon", id: anonId };
      const prev = await client.query<ExistingVoteRow>(
        `SELECT option_key FROM anon_post_votes
          WHERE post_id=$1 AND anon_id=$2 LIMIT 1`,
        [post.id, anonId],
      );
      previousOption = prev.rows[0]?.option_key ?? null;
      isNew = previousOption === null;
      if (previousOption === optionKey) {
        await client.query("COMMIT");
        return NextResponse.json(
          { ok: true, optionKey, status: "unchanged", actor: { kind: "anon" } },
          { status: 200 },
        );
      }
      await client.query(
        `INSERT INTO anon_post_votes (post_id, anon_id, option_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (post_id, anon_id) DO UPDATE
           SET option_key = EXCLUDED.option_key,
               updated_at = now()`,
        [post.id, anonId, optionKey],
      );
      await client.query(
        `INSERT INTO anon_actions (anon_id, kind, target_kind, target_id, metadata)
         VALUES ($1, 'vote', 'post', $2, jsonb_build_object('optionKey', $3::text))`,
        [anonId, post.id, optionKey],
      );
    }

    // Mutate per-option counters
    if (previousOption && previousOption !== optionKey) {
      await client.query(
        `UPDATE community_post_items SET vote_count = GREATEST(vote_count - 1, 0)
          WHERE post_id=$1 AND option_key=$2`,
        [post.id, previousOption],
      );
    }
    await client.query(
      `UPDATE community_post_items SET vote_count = vote_count + 1
        WHERE post_id=$1 AND option_key=$2`,
      [post.id, optionKey],
    );

    // Top-level vote_count: only inc when new vote (switching keeps total)
    if (isNew) {
      await client.query(
        `UPDATE community_posts SET vote_count = vote_count + 1 WHERE id=$1`,
        [post.id],
      );
    }

    // Reward (auth users only, new votes only, daily cap)
    let rewarded = 0;
    if (userId && isNew) {
      const cap = await client.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM reward_events
          WHERE user_id=$1 AND action=$2 AND created_at > date_trunc('day', now())`,
        [userId, REWARD_ACTION],
      );
      const todayCount = Number(cap.rows[0]?.c ?? "0");
      if (todayCount < DAILY_CAP_VOTES) {
        await client.query(
          `INSERT INTO reward_events (user_id, action, points_awarded, source_type, source_id, metadata)
           VALUES ($1, $2, $3, 'community_post', $4, jsonb_build_object('optionKey', $5::text, 'slug', $6::text))`,
          [userId, REWARD_ACTION, REWARD_POINTS, post.id, optionKey, slug],
        );
        // Wallet balance is reconciled by AFTER INSERT trigger
        // trg_reward_events_credit_wallet (migration 0012).
        rewarded = REWARD_POINTS;
      }
    }

    await client.query("COMMIT");

    // Best-effort: if this is the invitee's first authenticated vote,
    // award their referrer (+50). Runs outside the vote TX so failure here
    // never blocks the vote response.
    if (userId && isNew) {
      try {
        await tryValidateReferral(userId, REWARD_ACTION);
      } catch {
        // swallow — vote already committed; referral can be retried on next action
      }
    }

    return NextResponse.json(
      {
        ok: true,
        optionKey,
        previousOption,
        status: isNew ? "created" : "switched",
        actor: { kind: actor.kind },
        rewardCoins: rewarded,
      },
      { status: 200 },
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      { error: "internal", message: (err as Error).message },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
