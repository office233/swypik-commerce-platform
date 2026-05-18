/**
 * Upload suggestions for creator videos.
 * Migrated to Copilot 2-pass auth via fetchCopilot.
 */

import { fetchCopilot, getCopilotGhuTokens } from "./github-models-tokens";

export type UploadSuggestionInput = {
  description?: string;
  product_name?: string;
  productName?: string;
  product_link?: string;
  productLink?: string;
};

export type UploadSuggestionResult = {
  hooks: [string, string, string];
  caption: string;
  tags: string[];
  product_keywords: string[];
};

function getModel(): string {
  return (process.env.UPLOAD_SUGGEST_MODEL || process.env.OPENROUTER_MODEL || "gpt-4o-mini").replace(/^openai\//, "");
}

const SYSTEM_PROMPT = `Esti asistentul AI pentru creatori Swypik. Generezi idei scurte pentru clipuri verticale in limba romana.

Reguli stricte:
- Raspunde DOAR JSON valid, fara markdown.
- hooks: EXACT 3 optiuni, fiecare max 95 caractere.
- caption: 1-2 propozitii, max 280 caractere.
- tags: 5-10 hashtag-uri cu #.
- product_keywords: 3-8 cuvinte scurte fara #.
- Fara claims medicale, reduceri sau stocuri.`;

function normalizeText(value: unknown, maxLength = 120): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, limit);
}

function normalizeTag(tag: string): string {
  const cleaned = tag.trim().replace(/^#+/, "").replace(/\s+/g, "").replace(/[^\p{L}\p{N}_-]/gu, "").toLowerCase();
  return cleaned ? `#${cleaned}` : "";
}

function parseSuggestionJson(content: string): Partial<UploadSuggestionResult> | null {
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

function sanitizeResult(value: Partial<UploadSuggestionResult> | null, fallback: UploadSuggestionResult): UploadSuggestionResult {
  const hooks = asStringArray(value?.hooks, 3);
  const tags = asStringArray(value?.tags, 10).map(normalizeTag).filter(Boolean);
  const productKeywords = asStringArray(value?.product_keywords, 8);
  return {
    hooks: [
      normalizeText(hooks[0], 95) || fallback.hooks[0],
      normalizeText(hooks[1], 95) || fallback.hooks[1],
      normalizeText(hooks[2], 95) || fallback.hooks[2],
    ],
    caption: normalizeText(value?.caption, 280) || fallback.caption,
    tags: tags.length ? tags : fallback.tags,
    product_keywords: productKeywords.length ? productKeywords : fallback.product_keywords,
  };
}

function inferProductName(input: UploadSuggestionInput): string {
  const direct = normalizeText(input.product_name || input.productName, 80);
  if (direct) return direct;
  const link = normalizeText(input.product_link || input.productLink, 240);
  const productId = link.match(/\/product\/([^/?#]+)/)?.[1];
  if (productId) return productId.replace(/[-_]+/g, " ").trim();
  return "produsul";
}

export function fallbackUploadSuggestions(input: UploadSuggestionInput): UploadSuggestionResult {
  const productName = inferProductName(input);
  const slug = productName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "").toLowerCase();
  return {
    hooks: [
      `Nu ma asteptam ca ${productName} sa fie atat de util...`,
      `Am testat ${productName} ca sa vezi daca merita banii`,
      `3 detalii despre ${productName} pe care le observi abia dupa ce il folosesti`,
    ],
    caption: `Am testat ${productName} si am strans cele mai importante detalii intr-un clip scurt.`,
    tags: ["#swypik", "#recomandare", "#testat", "#viral", slug ? `#${slug}` : "#produs"],
    product_keywords: [productName, "review", "test", "recomandare"],
  };
}

export async function suggestUploadContent(input: UploadSuggestionInput): Promise<UploadSuggestionResult> {
  const fallback = fallbackUploadSuggestions(input);
  if (getCopilotGhuTokens().length === 0) return fallback;

  try {
    const productName = inferProductName(input);
    const description = normalizeText(input.description, 800);
    const productLink = normalizeText(input.product_link || input.productLink, 240);

    const { res } = await fetchCopilot("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Context clip:\nProdus: ${productName}\nLink: ${productLink || "n/a"}\nDescriere: ${description || "n/a"}` },
        ],
        temperature: 0.75,
        max_tokens: 450,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.warn("[upload-suggestions] http", res.status);
      return fallback;
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content || "{}";
    return sanitizeResult(parseSuggestionJson(content), fallback);
  } catch (error) {
    console.error("[AI Upload Suggestions] Error:", error);
    return fallback;
  }
}
