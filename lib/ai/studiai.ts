/**
 * StudiAI client — OpenAI-compatible API gateway.
 * Single source of truth for all server-side LLM calls.
 *
 * Env:
 *   STUDIAI_API_KEY   (required)  e.g. sk_studiai_xxx
 *   STUDIAI_BASE_URL  (optional)  defaults to https://ai.studiai.ro/v1
 *   STUDIAI_MODEL     (optional)  defaults to claude-opus-4-7
 *
 * Multiple keys for round-robin: comma-separated in STUDIAI_API_KEYS.
 */

import { logger } from "@/lib/logger";

const DEV_BASE_URL = "https://ai.studiai.ro/v1";
const BASE_URL = (() => {
  const v = process.env.STUDIAI_BASE_URL;
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    logger.error(
      { env: "STUDIAI_BASE_URL" },
      "STUDIAI_BASE_URL nu este setat în producție — apelurile LLM vor eșua până la configurare"
    );
    return "";
  }
  return DEV_BASE_URL;
})();
const DEFAULT_MODEL = process.env.STUDIAI_MODEL || "claude-opus-4-7";

function getKeys(): string[] {
  const multi = process.env.STUDIAI_API_KEYS;
  if (multi) return multi.split(",").map((k) => k.trim()).filter(Boolean);
  const single = process.env.STUDIAI_API_KEY;
  return single ? [single.trim()] : [];
}

let _rrCounter = 0;
function pickKey(): string | null {
  const keys = getKeys();
  if (keys.length === 0) return null;
  const key = keys[_rrCounter % keys.length];
  _rrCounter += 1;
  return key;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseJson?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function isStudiAIConfigured(): boolean {
  return getKeys().length > 0;
}

/**
 * Send chat completion request. Returns assistant message text (string).
 * Throws on network / HTTP / parse errors.
 */
export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const key = pickKey();
  if (!key) throw new Error("STUDIAI_API_KEY missing");
  if (!BASE_URL) throw new Error("STUDIAI_BASE_URL missing (required in production)");

  const body: Record<string, unknown> = {
    model: opts.model || DEFAULT_MODEL,
    messages,
  };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;
  if (opts.responseJson) body.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null;
  if (opts.signal) opts.signal.addEventListener("abort", () => ctrl.abort());

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`studiai_http_${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("studiai_no_content");
    return content;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Parse JSON from an LLM response, tolerating markdown code fences.
 */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(payload) as T;
  } catch {
    const firstBrace = payload.indexOf("{");
    const lastBrace = payload.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(payload.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
