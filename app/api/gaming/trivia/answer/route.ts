import { NextRequest, NextResponse } from "next/server";
import { getOrCreateSocialUser } from "@/lib/social/session";
import { dbQuery } from "@/lib/db";
import { grantDailyCappedXp } from "@/lib/gaming/xp";
import { awardSwyp } from "@/lib/swyp/rewards";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyGamingToken, hashToken } from "@/lib/gaming/tokens";
import { logger } from "@/lib/logger";
import { z } from "zod";
import type { TriviaQuestion } from "@/lib/gaming/opentdb";

export const dynamic = "force-dynamic";

const AnswerPayloadSchema = z.object({
  roundToken: z.string().min(1),
  answers: z.array(z.object({ questionId: z.string().min(1), answer: z.string().min(1).max(500) })).min(1).max(50),
});

const XP_PER_CORRECT = 20;

/**
 * POST /api/gaming/trivia/answer — the ONLY place a trivia score is
 * computed. The client never submits a score: it submits its picked answers,
 * and this grades them against gaming_trivia_rounds.questions (never sent
 * to the client) using the signed, single-use round token from GET
 * /api/gaming/trivia.
 */
export async function POST(req: NextRequest) {
  if (!isEnabled("gaming")) return frozenResponse("gaming");

  try {
    const session = await getOrCreateSocialUser();
    const userId = session?.userId;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit("gamingTriviaAnswer", userId, { limit: 10, window: 60 });
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = AnswerPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }
    const { roundToken, answers } = parsed.data;

    const payload = verifyGamingToken(roundToken, "trivia");
    if (!payload || payload.userId !== userId) {
      return NextResponse.json({ ok: false, error: "invalid_round_token" }, { status: 400 });
    }

    const tokenHash = hashToken(roundToken);
    // Atomically consume the round (single-use, tamper/expiry already
    // checked above; expires_at is the DB-side backstop).
    const { rows } = await dbQuery<{ id: string; questions: TriviaQuestion[] }>(
      `UPDATE gaming_trivia_rounds
         SET used_at = now()
       WHERE token_hash = $1 AND user_id = $2 AND id = $3
         AND used_at IS NULL AND expires_at > now()
       RETURNING id, questions`,
      [tokenHash, userId, payload.ref],
    );
    const round = rows[0];
    if (!round) {
      return NextResponse.json({ ok: false, error: "round_token_reused_or_expired" }, { status: 400 });
    }

    const questions = round.questions;
    const byId = new Map(questions.map((q) => [q.id, q]));
    let correctCount = 0;
    const results = answers.map(({ questionId, answer }) => {
      const q = byId.get(questionId);
      if (!q) return { questionId, correct: false, correctAnswer: null };
      const isCorrect = q.correctAnswer === answer;
      if (isCorrect) correctCount++;
      return { questionId, correct: isCorrect, correctAnswer: q.correctAnswer };
    });

    const score = correctCount * 50;
    await dbQuery(`UPDATE gaming_trivia_rounds SET score = $2 WHERE id = $1`, [round.id, score]);
    await dbQuery(
      `INSERT INTO gaming_scores (user_id, game_id, score, duration_ms, metadata) VALUES ($1, 'trivia_daily', $2, 0, $3)`,
      [userId, score, JSON.stringify({ roundId: round.id, correctCount, totalQuestions: questions.length })],
    );

    // XP with daily cap, same accounting as /api/gaming/score.
    const rawXp = Math.min(100, correctCount * XP_PER_CORRECT);
    const earnedXp = await grantDailyCappedXp(
      userId,
      rawXp,
      `INSERT INTO gaming_user_profiles (user_id, xp_points, level, trivia_streak_days, last_trivia_at)
         VALUES ($1, $2, 1, 1, now())
         ON CONFLICT (user_id) DO UPDATE
         SET xp_points = gaming_user_profiles.xp_points + $2,
             level = FLOOR(SQRT((gaming_user_profiles.xp_points + $2) / 100)) + 1,
             last_trivia_at = now(),
             updated_at = now()`,
    );

    let swypAwarded = false;
    try {
      const rewardResult = await awardSwyp({
        userId,
        action: "gaming_trivia_daily",
        refId: `trivia_${round.id}`,
        metadata: { correctCount, totalQuestions: questions.length, score },
      });
      swypAwarded = rewardResult.awarded;
    } catch (e) {
      logger.warn({ err: e, userId }, "[gaming.trivia.answer] awardSwyp failed");
    }

    return NextResponse.json({
      ok: true,
      score,
      correctCount,
      totalQuestions: questions.length,
      earnedXp,
      swypAwarded,
      results,
    });
  } catch (err) {
    logger.error({ err }, "[gaming.trivia.answer] failed");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
