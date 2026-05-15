/**
 * Speech-to-text via GitHub Models / OpenAI-compatible Whisper.
 * Fallback: stub returnând { text:'', segments:[] } cu warning.
 *
 * GitHub Models nu garantează Whisper public; folosim env-flag pt control.
 * Dacă `GITHUB_MODELS_WHISPER` ≠ "1" → fallback stub direct.
 */

export type CaptionSegment = { start: number; end: number; text: string };
export type TranscribeResult = { text: string; segments: CaptionSegment[] };

const WHISPER_ENDPOINT =
  process.env.GITHUB_MODELS_WHISPER_ENDPOINT ||
  "https://models.github.ai/inference/audio/transcriptions";
const WHISPER_MODEL = process.env.GITHUB_MODELS_WHISPER_MODEL || "openai/whisper-1";
const ENABLED = process.env.GITHUB_MODELS_WHISPER === "1";

export async function transcribe(
  audioBuffer: Buffer,
  lang?: string,
  filename = "audio.mp3",
): Promise<TranscribeResult> {
  if (!ENABLED) {
    console.warn("[transcribe] disabled (GITHUB_MODELS_WHISPER!=1) → empty stub");
    return { text: "", segments: [] };
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  if (!token) {
    console.warn("[transcribe] no GITHUB_TOKEN → empty stub");
    return { text: "", segments: [] };
  }
  if (audioBuffer.length > 25 * 1024 * 1024) {
    console.warn("[transcribe] audio >25MB → skipped");
    return { text: "", segments: [] };
  }

  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" }), filename);
    form.append("model", WHISPER_MODEL);
    form.append("response_format", "verbose_json");
    if (lang) form.append("language", lang);

    const res = await fetch(WHISPER_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      console.warn("[transcribe] http", res.status);
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
    console.warn("[transcribe] failed:", (e as Error).message);
    return { text: "", segments: [] };
  }
}
