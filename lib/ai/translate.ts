/**
 * Translate subtitle segments to target language via GitHub Models gpt-4o-mini.
 * Preservă timestamps. Pe eroare → returnează segmentele originale (best-effort).
 */
import OpenAI from "openai";
import type { CaptionSegment } from "./transcribe";

export type TargetLang = "en" | "es" | "fr" | "de" | "pt" | "it" | "ro";

const LANG_NAME: Record<TargetLang, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ro: "Romanian",
};

function client(): OpenAI | null {
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  if (token) {
    return new OpenAI({
      apiKey: token,
      baseURL: process.env.GITHUB_MODELS_ENDPOINT ?? "https://models.github.ai/inference",
    });
  }
  if (process.env.OPENAI_API_KEY) return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return null;
}

export async function translateSegments(
  segments: CaptionSegment[],
  targetLang: TargetLang,
): Promise<CaptionSegment[]> {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const c = client();
  if (!c) return segments;

  const langName = LANG_NAME[targetLang] || targetLang;
  const compact = segments.map((s, i) => ({ i, t: s.text }));

  try {
    const res = await c.chat.completions.create({
      model: process.env.TRANSLATE_MODEL || "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a subtitle translator. Translate the provided segments to ${langName}. Return STRICT JSON {"segments":[{"i":number,"t":"translated"}...]}. Preserve indices. Keep natural, concise phrasing.`,
        },
        { role: "user", content: JSON.stringify({ segments: compact }) },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" } as any,
      max_tokens: Math.min(4000, 80 + compact.length * 80),
    });
    const raw = res.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const arr: Array<{ i: number; t: string }> = Array.isArray(parsed?.segments) ? parsed.segments : [];
    const byIdx = new Map<number, string>();
    for (const item of arr) {
      if (typeof item?.i === "number" && typeof item?.t === "string") byIdx.set(item.i, item.t);
    }
    return segments.map((s, i) => ({ start: s.start, end: s.end, text: byIdx.get(i) ?? s.text }));
  } catch (e) {
    console.warn("[translateSegments] failed:", (e as Error).message);
    return segments;
  }
}

export function segmentsToText(segs: CaptionSegment[]): string {
  return segs.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
}
