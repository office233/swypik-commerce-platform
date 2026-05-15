/**
 * AI Content Moderation pe text generat de user (titluri video, descrieri).
 * Folosește GitHub Models chat completions (openai/gpt-4o-mini) cu prompt strict JSON.
 * Defaults `flagged=false` la orice eroare — moderation never blocks happy path.
 */

import OpenAI from "openai";

const SYSTEM = `Ești un clasificator de moderare de conținut pentru un marketplace românesc.
Analizează textul primit și raportează dacă conține: violență, hate speech, conținut sexual explicit, spam evident, autovătămare, drogări, doxxing.
Returnează STRICT JSON: {"flagged": boolean, "reasons": string[]}.
"reasons" e listă de etichete scurte ("violence","hate","sexual","spam","self_harm","drugs","doxxing"). Fără text explicativ.`;

function client(): OpenAI | null {
  const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  if (token) {
    return new OpenAI({
      apiKey: token,
      baseURL: process.env.GITHUB_MODELS_ENDPOINT ?? "https://api.githubcopilot.com",
      defaultHeaders: {
        "Editor-Version": "vscode/1.95.0",
        "Copilot-Integration-Id": "vscode-chat",
      },
    });
  }
  if (process.env.OPENAI_API_KEY) return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return null;
}

export type ModerateResult = { flagged: boolean; reasons: string[] };

export async function moderate(text: string): Promise<ModerateResult> {
  const trimmed = String(text || "").slice(0, 4000).trim();
  if (!trimmed) return { flagged: false, reasons: [] };
  const c = client();
  if (!c) return { flagged: false, reasons: [] };

  try {
    const res = await c.chat.completions.create({
      model: process.env.MODERATION_TEXT_MODEL || "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: trimmed },
      ],
      temperature: 0,
      max_tokens: 80,
      response_format: { type: "json_object" } as any,
    });
    const content = res.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return {
      flagged: Boolean(parsed.flagged),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [],
    };
  } catch {
    return { flagged: false, reasons: [] };
  }
}
