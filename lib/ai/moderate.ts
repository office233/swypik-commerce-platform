/**
 * AI Content Moderation pe text generat de user (titluri video, descrieri).
 * Folosește Copilot 2-pass auth via fetchCopilot.
 * Defaults `flagged=false` la orice eroare — moderation never blocks happy path.
 */

import { fetchCopilot, getCopilotGhuTokens } from "./github-models-tokens";

const SYSTEM = `Ești un clasificator de moderare de conținut pentru un marketplace românesc.
Analizează textul primit și raportează dacă conține: violență, hate speech, conținut sexual explicit, spam evident, autovătămare, drogări, doxxing.
Returnează STRICT JSON: {"flagged": boolean, "reasons": string[]}.
"reasons" e listă de etichete scurte ("violence","hate","sexual","spam","self_harm","drugs","doxxing"). Fără text explicativ.`;

export type ModerateResult = { flagged: boolean; reasons: string[] };

export async function moderate(text: string): Promise<ModerateResult> {
  const trimmed = String(text || "").slice(0, 4000).trim();
  if (!trimmed) return { flagged: false, reasons: [] };
  if (getCopilotGhuTokens().length === 0) return { flagged: false, reasons: [] };

  try {
    const model = (process.env.MODERATION_TEXT_MODEL || "gpt-4o-mini").replace(/^openai\//, "");
    const { res } = await fetchCopilot("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: trimmed },
        ],
        temperature: 0,
        max_tokens: 80,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn("[moderate] http", res.status);
      return { flagged: false, reasons: [] };
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return {
      flagged: Boolean(parsed.flagged),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [],
    };
  } catch {
    return { flagged: false, reasons: [] };
  }
}
