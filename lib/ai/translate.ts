/**
 * Translate subtitle segments to target language via Copilot 2-pass auth.
 * Preservă timestamps. Pe eroare → returnează segmentele originale (best-effort).
 */
import { fetchCopilot, getCopilotGhuTokens } from "./github-models-tokens";
import type { CaptionSegment } from "./transcribe";
import { logger } from "@/lib/logger";

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

export async function translateSegments(
  segments: CaptionSegment[],
  targetLang: TargetLang,
): Promise<CaptionSegment[]> {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  if (getCopilotGhuTokens().length === 0) return segments;

  const langName = LANG_NAME[targetLang] || targetLang;
  const compact = segments.map((s, i) => ({ i, t: s.text }));

  try {
    const model = (process.env.TRANSLATE_MODEL || "gpt-4o-mini").replace(/^openai\//, "");
    const { res } = await fetchCopilot("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a subtitle translator. Translate the provided segments to ${langName}. Return STRICT JSON {"segments":[{"i":number,"t":"translated"}...]}. Preserve indices. Keep natural, concise phrasing.`,
          },
          { role: "user", content: JSON.stringify({ segments: compact }) },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: Math.min(4000, 80 + compact.length * 80),
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[translateSegments] http");
      return segments;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const arr: Array<{ i: number; t: string }> = Array.isArray(parsed?.segments) ? parsed.segments : [];
    const byIdx = new Map<number, string>();
    for (const item of arr) {
      if (typeof item?.i === "number" && typeof item?.t === "string") byIdx.set(item.i, item.t);
    }
    return segments.map((s, i) => ({ start: s.start, end: s.end, text: byIdx.get(i) ?? s.text }));
  } catch (e) {
    logger.warn({ err: e }, "[translateSegments] failed");
    return segments;
  }
}

export function segmentsToText(segs: CaptionSegment[]): string {
  return segs.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
}
