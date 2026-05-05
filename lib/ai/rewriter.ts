/**
 * AI Product Rewriter
 * Takes raw supplier product data and creates
 * beautiful Romanian titles, descriptions, and benefits
 * Supports OpenRouter + OpenAI
 */

import OpenAI from "openai";

function getAIClient(): OpenAI | null {
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return null;
}

function getModel(): string {
  return process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";
}

export type RewriteResult = {
  aiTitle: string;
  aiDescription: string;
  benefits: string[];
  dealLabel: string;
  whyBuy: string;
  warnings: string[];
};

const REWRITE_PROMPT = `Ești un copywriter expert pentru un magazin online din România.
Primești un produs și trebuie să-l rescrii pentru clienții români.

REGULI:
- Titlu: max 60 caractere, clar, atractiv, fără CAPS LOCK, fără chinezești
- Descriere: 2-3 propoziții naturale, focus pe beneficii reale
- Beneficii: exact 3 bullet points scurte și convingătoare
- Deal label: "Best deal" / "-X%" / "Popular" / "Nou" / "Top vânzări"
- Why buy: O propoziție scurtă de tip "De ce merită"
- Warnings: Atenționări oneste (livrare, mărime, etc.)

Răspunde DOAR cu JSON valid (fără markdown, fără backticks):
{
  "aiTitle": "Titlul rescris",
  "aiDescription": "Descrierea rescrisă",
  "benefits": ["Beneficiu 1", "Beneficiu 2", "Beneficiu 3"],
  "dealLabel": "Label",
  "whyBuy": "De ce merită",
  "warnings": ["Atenționare 1"]
}`;

export async function rewriteProduct(product: {
  title: string;
  description: string;
  price: number;
  rating: number;
  orders: number;
  category: string;
  deliveryDays: number;
}): Promise<RewriteResult> {
  const client = getAIClient();
  if (!client) {
    return fallbackRewrite(product);
  }

  try {
    const model = getModel();

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: REWRITE_PROMPT },
        {
          role: "user",
          content: `Produs de rescris:
Titlu original: ${product.title}
Descriere originală: ${product.description}
Preț: ${product.price} lei
Rating: ${product.rating}/5
Comenzi: ${product.orders}
Categorie: ${product.category}
Livrare: ${product.deliveryDays} zile`,
        },
      ],
      temperature: 0.8,
      max_tokens: 400,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      return JSON.parse(cleaned) as RewriteResult;
    } catch {
      console.log("[AI Rewriter] JSON parse failed, using fallback");
      return fallbackRewrite(product);
    }
  } catch (error) {
    console.error("[AI Rewriter] Error:", error);
    return fallbackRewrite(product);
  }
}

function fallbackRewrite(product: {
  title: string;
  description: string;
  price: number;
  rating: number;
  orders: number;
  category: string;
  deliveryDays: number;
}): RewriteResult {
  const cleanTitle = product.title
    .replace(/[^\x00-\x7F\u0100-\u024F\u0250-\u02AF\u1E00-\u1EFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  const discountPercent = Math.round(Math.random() * 15 + 25);

  return {
    aiTitle: cleanTitle || product.title.slice(0, 60),
    aiDescription: product.description || `Un produs ${product.category} cu rating de ${product.rating}/5 și peste ${product.orders} comenzi. Livrare în ${product.deliveryDays} zile.`,
    benefits: [
      `Rating excelent: ${product.rating}/5`,
      `Peste ${product.orders} clienți mulțumiți`,
      `Livrare în ${product.deliveryDays} zile`,
    ],
    dealLabel: product.rating >= 4.8 ? "Top rating" : `-${discountPercent}%`,
    whyBuy: `Raport bun între preț, calitate și livrare rapidă.`,
    warnings: product.deliveryDays > 15
      ? ["Livrarea poate dura până la " + product.deliveryDays + " zile"]
      : [],
  };
}
