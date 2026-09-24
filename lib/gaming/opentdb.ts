import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

export interface TriviaQuestion {
  id: string;
  category: string;
  difficulty: string;
  question: string;
  options: string[];
  correctAnswer: string;
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&eacute;/g, "é")
    .replace(/&oacute;/g, "ó");
}

const FALLBACK_QUESTIONS: TriviaQuestion[] = [
  {
    id: "q_fallback_1",
    category: "Video Games",
    difficulty: "easy",
    question: "What is the best-selling video game of all time?",
    options: ["Minecraft", "Tetris", "Grand Theft Auto V", "Super Mario Bros"],
    correctAnswer: "Minecraft",
  },
  {
    id: "q_fallback_2",
    category: "Video Games",
    difficulty: "medium",
    question: "In what year was the first PlayStation console released by Sony?",
    options: ["1994", "1996", "1992", "1998"],
    correctAnswer: "1994",
  },
  {
    id: "q_fallback_3",
    category: "Video Games",
    difficulty: "easy",
    question: "Who is the green-capped hero of the Legend of Zelda series?",
    options: ["Link", "Zelda", "Ganon", "Luigi"],
    correctAnswer: "Link",
  },
];

/**
 * Daily trivia question pool, cached per-day. Includes correctAnswer — this
 * is server-side only; callers MUST strip it before sending to the client
 * (see app/api/gaming/trivia/route.ts, which builds a signed round token
 * instead of trusting the client with answers).
 */
export async function getDailyTriviaQuestions(): Promise<TriviaQuestion[]> {
  const todayKey = `gaming:trivia:cache:${new Date().toISOString().slice(0, 10)}`;

  try {
    const redis = getRedis();
    if (redis) {
      const cached = await redis.get(todayKey);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached;
      }
    }
  } catch (e) {
    logger.debug({ err: e }, "[gaming.trivia] redis cache read failed, continuing");
  }

  try {
    const res = await fetch("https://opentdb.com/api.php?amount=5&category=15&type=multiple", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`opentdb status ${res.status}`);
    const data = await res.json();

    if (data.response_code === 0 && Array.isArray(data.results)) {
      type OpenTdbResult = { category: string; difficulty: string; question: string; correct_answer: string; incorrect_answers: string[] };
      const questions: TriviaQuestion[] = (data.results as OpenTdbResult[]).map((q, idx) => {
        const decodedCorrect = decodeHTMLEntities(q.correct_answer);
        const decodedIncorrect = q.incorrect_answers.map(decodeHTMLEntities);
        const options = [...decodedIncorrect, decodedCorrect].sort(() => Math.random() - 0.5);

        return {
          id: `q_${idx}_${Date.now()}`,
          category: decodeHTMLEntities(q.category),
          difficulty: q.difficulty,
          question: decodeHTMLEntities(q.question),
          options,
          correctAnswer: decodedCorrect,
        };
      });

      try {
        const redis = getRedis();
        if (redis) {
          await redis.set(todayKey, JSON.stringify(questions), "EX", 86400).catch(() => null);
        }
      } catch (e) {
        logger.debug({ err: e }, "[gaming.trivia] redis cache write failed");
      }

      return questions;
    }
  } catch (err) {
    logger.warn({ err }, "[gaming.trivia] opentdb fetch failed, using fallback questions");
  }

  return FALLBACK_QUESTIONS;
}
