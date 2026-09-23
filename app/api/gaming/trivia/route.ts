import { NextRequest, NextResponse } from "next/server";
import { getDailyTriviaQuestions } from "@/lib/gaming/opentdb";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isEnabled("gaming")) return frozenResponse("gaming");

  try {
    const questions = await getDailyTriviaQuestions();
    // Trimitem întrebările către client fără răspunsul corect expus (pentru anti-cheat)
    const sanitized = questions.map(({ id, category, difficulty, question, options }) => ({
      id,
      category,
      difficulty,
      question,
      options,
    }));

    return NextResponse.json({
      ok: true,
      questions: sanitized,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
