import { NextResponse } from "next/server";
import { fetchCopilot, getCopilotGhuTokens } from "@/lib/ai/github-models-tokens";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const SYSTEM = `Ești un expert TikTok/Reels din România. Pe baza titlului și descrierii unui clip video produs, generezi exact 5 hashtag-uri scurte, relevante, fără spații, în limba română (folosește diacritice doar dacă e natural). Returnează STRICT JSON de forma {"hashtags":["#tag1","#tag2",...]}. Fiecare hashtag începe cu # și are 3-20 caractere.`;

const FALLBACK = ["#swypik", "#romania", "#viral", "#fyp", "#shopping"];

export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("hashtag-suggest", session.userId, { limit: 20, window: 60 });
  if (!rl.success) {
    return NextResponse.json({ error: "Prea multe cereri. Încearcă din nou într-un minut." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").slice(0, 200);
  const description = String(body.description || "").slice(0, 1000);
  if (!title && !description) {
    return NextResponse.json({ hashtags: FALLBACK });
  }

  if (getCopilotGhuTokens().length === 0) {
    return NextResponse.json({ hashtags: FALLBACK });
  }

  try {
    const model = (process.env.MODERATION_MODEL || "gpt-4o-mini").replace(/^openai\//, "");
    const { res } = await fetchCopilot("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Titlu: ${title}\nDescriere: ${description}` },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
        max_tokens: 200,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[suggest-hashtags] http");
      return NextResponse.json({ hashtags: FALLBACK });
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const list: string[] = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
    const cleaned = list
      .map((h) => String(h).trim())
      .filter((h) => h.length >= 2 && h.length <= 30)
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .slice(0, 5);
    if (cleaned.length === 0) {
      return NextResponse.json({ hashtags: FALLBACK });
    }
    return NextResponse.json({ hashtags: cleaned });
  } catch (e) {
    logger.warn({ err: e }, "[suggest-hashtags] failed");
    return NextResponse.json({ hashtags: FALLBACK });
  }
}
