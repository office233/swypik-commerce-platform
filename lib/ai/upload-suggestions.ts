import OpenAI from "openai";

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

function getAIClient(): OpenAI | null {
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  if (process.env.OPENAI_API_KEY) return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return null;
}

function getModel(): string {
  return process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";
}

const SYSTEM_PROMPT = `Ești asistentul AI pentru creatori Swypik. Generezi idei scurte pentru clipuri verticale de commerce în limba română.

Reguli stricte:
- Răspunde DOAR JSON valid, fără markdown/backticks.
- hooks: EXACT 3 opțiuni, fiecare max 95 caractere, naturale și catchy.
- caption: o singură descriere gata de lipit, 1-2 propoziții, max 280 caractere.
- tags: 5-10 hashtag-uri fără spații, cu #, relevante pentru clip.
- product_keywords: 3-8 cuvinte/expresii scurte pentru căutare produs, fără #.
- Nu inventa claims medicale, reduceri garantate, rezultate garantate sau stocuri reale.
- Dacă informația e vagă, folosește sugestii generale dar utile.`;

function normalizeText(value: unknown, maxLength = 120): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeTag(tag: string): string {
  const cleaned = tag
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase();
  return cleaned ? `#${cleaned}` : "";
}

function parseSuggestionJson(content: string): Partial<UploadSuggestionResult> | null {
  const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
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
  const slug = productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();

  return {
    hooks: [
      `Nu mă așteptam ca ${productName} să fie atât de util...`,
      `Am testat ${productName} ca să vezi dacă merită banii`,
      `3 detalii despre ${productName} pe care le observi abia după ce îl folosești`,
    ],
    caption: `Am testat ${productName} și am strâns cele mai importante detalii într-un clip scurt. Tu l-ai încerca?`,
    tags: ["#swypik", "#recomandare", "#testat", "#viral", slug ? `#${slug}` : "#produs"],
    product_keywords: [productName, "review", "test", "recomandare"],
  };
}

export async function suggestUploadContent(input: UploadSuggestionInput): Promise<UploadSuggestionResult> {
  const fallback = fallbackUploadSuggestions(input);
  const client = getAIClient();
  if (!client) return fallback;

  try {
    const productName = inferProductName(input);
    const description = normalizeText(input.description, 800);
    const productLink = normalizeText(input.product_link || input.productLink, 240);

    const completion = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Context clip creator:\nProdus: ${productName}\nLink produs: ${productLink || "n/a"}\nDescriere/idei creator: ${description || "n/a"}`,
        },
      ],
      temperature: 0.75,
      max_tokens: 450,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "{}";
    return sanitizeResult(parseSuggestionJson(content), fallback);
  } catch (error) {
    console.error("[AI Upload Suggestions] Error:", error);
    return fallback;
  }
}
