import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function aiClient(): OpenAI | null {
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  if (token) {
    return new OpenAI({
      apiKey: token,
      baseURL: "https://api.githubcopilot.com",
      defaultHeaders: {
        "Editor-Version": "vscode/1.95.0",
        "Copilot-Integration-Id": "vscode-chat",
      },
    });
  }
  if (process.env.OPENAI_API_KEY) return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return null;
}

const SYSTEM = `Ești un expert TikTok/Reels din România. Pe baza titlului și descrierii unui clip video produs, generezi exact 5 hashtag-uri scurte, relevante, fără spații, în limba română (folosește diacritice doar dacă e natural). Returnează STRICT JSON de forma {"hashtags":["#tag1","#tag2",...]}. Fiecare hashtag începe cu # și are 3-20 caractere.`;

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
    return NextResponse.json({ hashtags: ["#swypik", "#romania", "#viral", "#fyp", "#shopping"] });
  }

  const client = aiClient();
  if (!client) {
    return NextResponse.json({ hashtags: ["#swypik", "#romania", "#viral", "#fyp", "#shopping"] });
  }

  try {
    const res = await client.chat.completions.create({
      model: process.env.MODERATION_MODEL || "claude-opus-4.7",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Titlu: ${title}\nDescriere: ${description}` },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
      max_tokens: 200,
    });
    const raw = res.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const list: string[] = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
    const cleaned = list
      .map((h) => String(h).trim())
      .filter((h) => h.length >= 2 && h.length <= 30)
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .slice(0, 5);
    if (cleaned.length === 0) {
      return NextResponse.json({ hashtags: ["#swypik", "#romania", "#viral", "#fyp", "#shopping"] });
    }
    return NextResponse.json({ hashtags: cleaned });
  } catch (e) {
    console.warn("[suggest-hashtags] failed:", (e as Error).message);
    return NextResponse.json({ hashtags: ["#swypik", "#romania", "#viral", "#fyp", "#shopping"] });
  }
}
