import { NextResponse } from "next/server";
import { getOrCreateSocialUser } from "@/lib/social/session";
import { getDailyTriviaQuestions } from "@/lib/gaming/opentdb";
import { dbQuery } from "@/lib/db";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/security/rate-limit";
import { issueGamingToken, hashToken } from "@/lib/gaming/tokens";
import { TRIVIA_ROUND_TTL_SECONDS } from "@/lib/gaming/config";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/gaming/trivia — issues a fresh, server-authoritative round.
 *
 * The correct answers are stored in gaming_trivia_rounds, never sent to the
 * client. The client gets sanitized questions + a signed, single-use round
 * token; POST /api/gaming/trivia/answer is the only place scoring happens.
 */
export async function GET() {
  if (!isEnabled("gaming")) return frozenResponse("gaming");

  try {
    const session = await getOrCreateSocialUser();
    const userId = session?.userId;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("gamingTriviaStart", userId, { limit: 10, window: 60 });
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const questions = await getDailyTriviaQuestions();

    // token_hash is UNIQUE, so seed it with a throwaway unique placeholder
    // (the real hash needs the row's id first) and overwrite it below.
    const { rows } = await dbQuery<{ id: string }>(
      `INSERT INTO gaming_trivia_rounds (user_id, token_hash, questions, expires_at)
       VALUES ($1, encode(gen_random_bytes(32), 'hex'), $2, $3)
       RETURNING id`,
      [userId, JSON.stringify(questions), new Date(Date.now() + TRIVIA_ROUND_TTL_SECONDS * 1000).toISOString()],
    );
    const roundId = rows[0].id;

    const token = issueGamingToken("trivia", userId, roundId, TRIVIA_ROUND_TTL_SECONDS);
    const tokenHash = hashToken(token);
    await dbQuery(`UPDATE gaming_trivia_rounds SET token_hash = $1 WHERE id = $2`, [tokenHash, roundId]);

    const sanitized = questions.map(({ id, category, difficulty, question, options }) => ({
      id,
      category,
      difficulty,
      question,
      options,
    }));

    return NextResponse.json({
      ok: true,
      roundToken: token,
      questions: sanitized,
    });
  } catch (err) {
    logger.error({ err }, "[gaming.trivia] failed to issue round");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
