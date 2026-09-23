import { getRedis } from "@/lib/redis";

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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&eacute;/g, 'é')
    .replace(/&oacute;/g, 'ó');
}

export async function getDailyTriviaQuestions(): Promise<TriviaQuestion[]> {
  const todayKey = `gaming:trivia:cache:${new Date().toISOString().slice(0, 10)}`;

  // 1. Verificare cache în Redis
  try {
    const redis = getRedis();
    if (redis) {
      const cached = await redis.get(todayKey);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached;
      }
    }
  } catch (e) {
    // Redis optional in local dev
  }

  // 2. Fetch din Open Trivia DB (Video Games = 15, Pop Culture = 11, Science = 18)
  try {
    const res = await fetch("https://opentdb.com/api.php?amount=5&category=15&type=multiple", {
      next: { revalidate: 3600 },
    });
    const data = await res.json();

    if (data.response_code === 0 && Array.isArray(data.results)) {
      const questions: TriviaQuestion[] = data.results.map((q: any, idx: number) => {
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

      // Salvare în cache 24h
      try {
        const redis = getRedis();
        if (redis) {
          await redis.set(todayKey, JSON.stringify(questions), "EX", 86400).catch(() => null);
        }
      } catch (e) {}

      return questions;
    }
  } catch (err) {
    console.error("[Open Trivia DB Fetch Error]", err);
  }

  // Fallback de urgență în caz de downtime OpenTDB
  return [
    {
      id: "q_fallback_1",
      category: "Video Games",
      difficulty: "easy",
      question: "Care este cel mai bine vândut joc video din toate timpurile?",
      options: ["Minecraft", "Tetris", "Grand Theft Auto V", "Super Mario Bros"],
      correctAnswer: "Minecraft",
    },
    {
      id: "q_fallback_2",
      category: "Video Games",
      difficulty: "medium",
      question: "În ce an a fost lansată prima consolă PlayStation de către Sony?",
      options: ["1994", "1996", "1992", "1998"],
      correctAnswer: "1994",
    },
    {
      id: "q_fallback_3",
      category: "Video Games",
      difficulty: "easy",
      question: "Cine este personajul principal cu șapcă verde din seria Legend of Zelda?",
      options: ["Link", "Zelda", "Ganon", "Luigi"],
      correctAnswer: "Link",
    },
  ];
}
