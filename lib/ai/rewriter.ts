/**
 * AI Product Rewriter - Migrated to Copilot 2-pass auth via fetchCopilot.
 */

import { fetchCopilot, getCopilotGhuTokens } from "./github-models-tokens";
import { logger } from "@/lib/logger";

function getModel(): string {
  return (process.env.REWRITER_MODEL || process.env.OPENROUTER_MODEL || "gpt-4o-mini").replace(/^openai\//, "");
}

export type RewriteResult = {
  aiTitle: string;
  aiDescription: string;
  benefits: string[];
  dealLabel: string;
  whyBuy: string;
  warnings: string[];
};

const REWRITE_PROMPT = `Esti CEL MAI BUN copywriter de vanzari din Romania. Scrii pentru un magazin online premium.
Transforma produsul in oferta IREZISTIBILA.

Raspunde DOAR cu JSON valid:
{
  "aiTitle": "Titlu RO max 60 char",
  "aiDescription": "2-3 propozitii magnetice",
  "benefits": ["B1","B2","B3"],
  "dealLabel": "label",
  "whyBuy": "de ce ACUM",
  "warnings": ["w1","w2"]
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
  if (getCopilotGhuTokens().length === 0) return fallbackRewrite(product);

  try {
    const { res } = await fetchCopilot("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(),
        messages: [
          { role: "system", content: REWRITE_PROMPT },
          {
            role: "user",
            content: `Titlu: ${product.title}\nDescriere: ${product.description}\nPret: ${product.price} lei\nRating: ${product.rating}/5\nComenzi: ${product.orders}\nCategorie: ${product.category}\nLivrare: ${product.deliveryDays} zile`,
          },
        ],
        temperature: 0.8,
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "[AI Rewriter] http");
      return fallbackRewrite(product);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json?.choices?.[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    try {
      return JSON.parse(cleaned) as RewriteResult;
    } catch {
      return fallbackRewrite(product);
    }
  } catch (error) {
    logger.error({ err: error }, "[AI Rewriter] Error");
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
  const cleanTitle = product.title.replace(/\s+/g, " ").trim().slice(0, 60);
  const discountPercent = Math.round(Math.random() * 15 + 25);
  return {
    aiTitle: cleanTitle || product.title.slice(0, 60),
    aiDescription: product.description || `Produs ${product.category} cu rating ${product.rating}/5 si peste ${product.orders} comenzi.`,
    benefits: [`Rating: ${product.rating}/5`, `Peste ${product.orders} clienti`, `Livrare ${product.deliveryDays} zile`],
    dealLabel: product.rating >= 4.8 ? "Top rating" : `-${discountPercent}%`,
    whyBuy: `Raport bun pret/calitate si livrare rapida.`,
    warnings: product.deliveryDays > 15 ? ["Livrare lenta"] : [],
  };
}
