/**
 * Speech-to-text via Copilot 2-pass auth Whisper.
 * Fallback: stub returnând { text:'', segments:[] } cu warning.
 *
 * GitHub Copilot nu garantează Whisper public; folosim env-flag pt control.
 * Dacă `GITHUB_MODELS_WHISPER` ≠ "1" → fallback stub direct.
 */

import { fetchCopilot, getCopilotGhuTokens } from "./github-models-tokens";
import { logger } from "@/lib/logger";

export type CaptionSegment = { start: number; end: number; text: string };
export type TranscribeResult = { text: string; segments: CaptionSegment[] };

const WHISPER_MODEL = (process.env.GITHUB_MODELS_WHISPER_MODEL || "whisper-1").replace(/^openai\//, "");
const ENABLED = process.env.GITHUB_MODELS_WHISPER === "1";

export async function transcribe(
  audioBuffer: Buffer,
  lang?: string,
  filename = "audio.mp3",
): Promise<TranscribeResult> {
  if (!ENABLED) {
    logger.warn("[transcribe] disabled (GITHUB_MODELS_WHISPER!=1) → empty stub");
    return { text: "", segments: [] };
  }
  if (getCopilotGhuTokens().length === 0) {
    logger.warn("[transcribe] no Copilot tokens → empty stub");
    return { text: "", segments: [] };
  }
  if (audioBuffer.length > 25 * 1024 * 1024) {
    logger.warn("[transcribe] audio >25MB → skipped");
    return { text: "", segments: [] };
  }

  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" }), filename);
    form.append("model", WHISPER_MODEL);
    form.append("response_format", "verbose_json");
    if (lang) form.append("language", lang);

    const { res } = await fetchCopilot("/audio/transcriptions", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[transcribe] http");
      return { text: "", segments: [] };
    }
    const json: any = await res.json();
    const text = String(json?.text || "");
    const segments: CaptionSegment[] = Array.isArray(json?.segments)
      ? json.segments.map((s: any) => ({
          start: Number(s.start) || 0,
          end: Number(s.end) || 0,
          text: String(s.text || "").trim(),
        }))
      : [];
    return { text, segments };
  } catch (e) {
    logger.warn({ err: e }, "[transcribe] failed");
    return { text: "", segments: [] };
  }
}
