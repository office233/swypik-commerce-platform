/**
 * Gemini client — wrapper subțire peste @google/generative-ai SDK.
 *
 * Funcții: generateHooks, generateCaption, generateTags, suggestCollection.
 * Output structurat JSON. Fallback la sugestii goale dacă API fail / cheia lipsește.
 *
 * Limbă default: ro.
 * Model: gemini-2.0-flash (sau fallback gemini-1.5-flash). Rapid + ieftin.
 */

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

export type SuggestionLanguage = "ro" | "en";

export type GeminiHookInput = {
  transcript?: string;
  description?: string;
  niche?: string;
  language?: SuggestionLanguage;
};

export type GeminiCaptionInput = {
  transcript?: string;
  description?: string;
  hookChoice: string;
  language?: SuggestionLanguage;
};

export type GeminiTagsInput = {
  transcript?: string;
  title?: string;
  description?: string;
  language?: SuggestionLanguage;
};

export type GeminiCollectionInput = {
  tags: string[];
  language?: SuggestionLanguage;
};

const MAX_INPUT_CHARS = 8000; // ~ 8k tokens budget
const MAX_OUTPUT_TOKENS = 500;

let cached: { client: GoogleGenerativeAI; model: GenerativeModel } | null = null;

function getModelName(): string {
  return process.env.GEMINI_MODEL || "gemini-2.0-flash";
}

function getClient(): { client: GoogleGenerativeAI; model: GenerativeModel } | null {
  if (cached) return cached;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: getModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.8,
    },
  });
  cached = { client, model };
  return cached;
}

function truncate(value: string | undefined | null, max = MAX_INPUT_CHARS): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function normalizeTag(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase();
  return cleaned ? `#${cleaned}` : "";
}

function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

async function runJson<T>(prompt: string): Promise<T | null> {
  const ctx = getClient();
  if (!ctx) return null;
  try {
    const res = await ctx.model.generateContent(prompt);
    const text = res.response?.text?.() || "";
    return parseJsonLoose<T>(text);
  } catch (err) {
    console.error("[Gemini] generateContent error:", (err as Error).message);
    return null;
  }
}

// ─── HOOKS ──────────────────────────────────────────────────────────
const HOOK_FALLBACK_RO = [
  "Nu știam că poți face asta...",
  "Am testat asta 7 zile.",
  "3 lucruri pe care le-aș fi vrut mai devreme.",
];

export async function generateHooks(input: GeminiHookInput): Promise<string[]> {
  const lang = input.language || "ro";
  const ctx = truncate(input.transcript || input.description);
  if (!ctx) return HOOK_FALLBACK_RO;

  const prompt = `Ești expert TikTok / Reels. Generează 3 hook-uri pentru un clip vertical de creator.
Limba: ${lang === "ro" ? "română" : "engleză"}.
Reguli:
- EXACT 3 hook-uri, fiecare max 80 caractere.
- Stil natural, conversațional, retention-first (primele 2 secunde din clip).
- Fără emoji, fără hashtaguri.
- Exemple de stil bun: "Nu știam că poți face asta...", "Am testat asta 7 zile.", "Merită sau e țeapă?"
${input.niche ? `Niche: ${truncate(input.niche, 120)}` : ""}

Context clip:
${ctx}

Răspunde DOAR JSON valid: {"hooks": ["...", "...", "..."]}`;

  const out = await runJson<{ hooks?: unknown }>(prompt);
  const arr = Array.isArray(out?.hooks) ? out!.hooks : [];
  const hooks = arr
    .map((h) => (typeof h === "string" ? h.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
  while (hooks.length < 3) hooks.push(HOOK_FALLBACK_RO[hooks.length] || "");
  return hooks.map((h) => h.slice(0, 95));
}

// ─── CAPTION ────────────────────────────────────────────────────────
export async function generateCaption(input: GeminiCaptionInput): Promise<string> {
  const lang = input.language || "ro";
  const ctx = truncate(input.transcript || input.description);
  if (!ctx && !input.hookChoice) return "";

  const prompt = `Scrie un caption pentru un clip vertical, limba ${lang === "ro" ? "română" : "engleză"}.
Hook ales de creator: "${truncate(input.hookChoice, 200)}"
Context clip:
${ctx || "(fără transcript)"}

Reguli:
- 1-2 propoziții, max 220 caractere.
- Ton natural, fără clickbait excesiv.
- Termină cu un CTA scurt sau o întrebare.
- Fără hashtaguri în caption (vor fi adăugate separat).

Răspunde DOAR JSON: {"caption": "..."}`;

  const out = await runJson<{ caption?: unknown }>(prompt);
  const caption = typeof out?.caption === "string" ? out!.caption.trim() : "";
  return caption.slice(0, 280);
}

// ─── TAGS ───────────────────────────────────────────────────────────
const TAG_FALLBACK = ["#swypik", "#fyp", "#viral", "#romania", "#trend"];

export async function generateTags(input: GeminiTagsInput): Promise<string[]> {
  const lang = input.language || "ro";
  const ctx = truncate(input.transcript || input.description || input.title, 4000);
  if (!ctx) return TAG_FALLBACK;

  const prompt = `Generează 5 hashtag-uri pentru un clip vertical, limba ${lang === "ro" ? "română" : "engleză"}.
Reguli:
- EXACT 5 hashtag-uri.
- Mix: 1 broad (#fyp), 2 niche (subiect), 1 platformă (#swypik), 1 trend.
- Lowercase, fără spații, fără diacritice.
- Format final: cu # în față.

Context:
${ctx}

Răspunde DOAR JSON: {"tags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]}`;

  const out = await runJson<{ tags?: unknown }>(prompt);
  const arr = Array.isArray(out?.tags) ? out!.tags : [];
  const tags = arr
    .map((t) => (typeof t === "string" ? normalizeTag(t) : ""))
    .filter(Boolean)
    .slice(0, 5);
  return tags.length ? tags : TAG_FALLBACK;
}

// ─── COLLECTION ─────────────────────────────────────────────────────
export async function suggestCollection(input: GeminiCollectionInput): Promise<string> {
  const lang = input.language || "ro";
  const tags = (input.tags || []).filter(Boolean).slice(0, 12);
  if (!tags.length) return "";

  const prompt = `Pe baza acestor hashtag-uri, propune UN nume scurt de colecție tematică pentru un app de social commerce.
Limba: ${lang === "ro" ? "română" : "engleză"}.
Reguli:
- Max 3 cuvinte, Title Case.
- Fără emoji, fără ghilimele.
- Exemple bune: "Gadgeturi Utile", "Beauty Hacks", "Cadouri Sub 100 Lei".

Hashtag-uri: ${tags.join(", ")}

Răspunde DOAR JSON: {"collection": "..."}`;

  const out = await runJson<{ collection?: unknown }>(prompt);
  const name = typeof out?.collection === "string" ? out!.collection.trim() : "";
  return name.replace(/["'`]/g, "").slice(0, 60);
}

// ─── COMBINED (used by /upload-suggestions) ─────────────────────────
export type GeminiBundle = {
  hooks: string[];
  caption: string;
  tags: string[];
  suggested_collection: string;
};

export async function generateBundle(opts: {
  transcript?: string;
  description?: string;
  title?: string;
  niche?: string;
  language?: SuggestionLanguage;
}): Promise<GeminiBundle> {
  // Generate hooks + tags în paralel; caption are nevoie de hook, deci după.
  const [hooks, tags] = await Promise.all([
    generateHooks({
      transcript: opts.transcript,
      description: opts.description,
      niche: opts.niche,
      language: opts.language,
    }),
    generateTags({
      transcript: opts.transcript,
      title: opts.title,
      description: opts.description,
      language: opts.language,
    }),
  ]);

  const [caption, suggested_collection] = await Promise.all([
    generateCaption({
      transcript: opts.transcript,
      description: opts.description,
      hookChoice: hooks[0] || "",
      language: opts.language,
    }),
    suggestCollection({ tags, language: opts.language }),
  ]);

  return { hooks, caption, tags, suggested_collection };
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
