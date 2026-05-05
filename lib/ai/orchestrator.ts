/**
 * AI Orchestrator — Central AI brain
 * Detects user intent, routes to appropriate handler
 * Supports OpenRouter (100+ models) and OpenAI
 */

import OpenAI from "openai";

function getAIClient(): OpenAI | null {
  // Priority: OpenRouter → OpenAI
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

export type ChatIntent =
  | "search_product"
  | "explain_product"
  | "compare_products"
  | "find_cheaper"
  | "add_to_cart"
  | "track_order"
  | "general_chat";

export type OrchestratorResult = {
  intent: ChatIntent;
  reply: string;
  searchQuery?: string;
  productId?: string;
  products?: any[];
};

const SYSTEM_PROMPT = `Ești asistentul AI al AICeVrei.ro — un magazin online inteligent pentru România.

ROLUL TĂU:
- Ajuți clienții să găsească produse bune la prețuri corecte
- Recomanzi produse pe baza nevoilor clientului
- Explici produsele simplu și onest
- Ești transparent cu timpul de livrare (8-25 zile)

REGULI:
- Răspunzi DOAR în română
- Ești prietenos, dar profesional
- Nu faci promisiuni false despre calitate sau livrare
- Nu vinzi produse medicale, arme sau produse periculoase
- Recomanzi mereu cele mai bune oferte (raport preț/calitate)
- Când clientul caută un produs, descrii scurt de ce e o alegere bună

PENTRU FIECARE MESAJ, răspunde cu un JSON valid (fără markdown, fără backticks):
{
  "intent": "search_product|explain_product|compare_products|find_cheaper|add_to_cart|track_order|general_chat",
  "reply": "Răspunsul tău către client",
  "searchQuery": "termenii de căutare extrași (dacă intent=search_product)",
  "productId": "id-ul produsului (dacă intent=explain_product sau add_to_cart)"
}

EXEMPLE INTENT:
- "vreau căști wireless" → search_product, searchQuery: "căști wireless"
- "ce gadget pot lua cadou?" → search_product, searchQuery: "gadget cadou"
- "explică-mi produsul ăsta" → explain_product
- "e mai ieftin ceva?" → find_cheaper
- "pune-l în coș" → add_to_cart
- "salut!" → general_chat
- "unde e comanda mea?" → track_order`;

export async function orchestrate(
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[] = [],
  productContext?: any[]
): Promise<OrchestratorResult> {
  const client = getAIClient();
  if (!client) {
    console.log("[AI Orchestrator] No API key — using fallback");
    return fallbackOrchestrate(userMessage);
  }

  try {
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...chatHistory.slice(-10),
      { role: "user", content: userMessage },
    ];

    if (productContext?.length) {
      messages.push({
        role: "system",
        content: `Produse disponibile în context: ${JSON.stringify(productContext.map((p) => ({ id: p.id, title: p.aiTitle || p.title, price: p.sellPrice || p.price })))}`,
      });
    }

    const model = getModel();
    console.log(`[AI Orchestrator] Using model: ${model}`);

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content || "{}";

    // Clean content — remove markdown code blocks if present
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      // If JSON parse fails, treat the whole response as a general chat reply
      console.log("[AI Orchestrator] JSON parse failed, using as plain reply");
      return {
        intent: "search_product",
        reply: content,
        searchQuery: userMessage,
      };
    }

    return {
      intent: result.intent || "general_chat",
      reply: result.reply || "Hmm, nu am înțeles. Poți reformula?",
      searchQuery: result.searchQuery,
      productId: result.productId,
    };
  } catch (error) {
    console.error("[AI Orchestrator] Error:", error);
    return fallbackOrchestrate(userMessage);
  }
}

/**
 * Smart fallback when no AI API is available
 */
function fallbackOrchestrate(message: string): OrchestratorResult {
  const msg = message.toLowerCase().trim();

  const searchKeywords = [
    "caut", "vreau", "arat", "gaseste", "cauta", "recomand",
    "casti", "telefon", "laptop", "gadget", "cadou", "beauty",
    "fitness", "auto", "casa", "led", "wireless", "sport",
    "aspirator", "lampa", "perie", "camera", "ceas",
    "ieftin", "bun", "cel mai", "oferta", "reducere",
  ];

  const explainKeywords = ["explic", "detalii", "spune-mi mai mult", "ce face", "la ce e bun"];
  const cheaperKeywords = ["mai ieftin", "alternativ", "alt", "mai bun pret"];
  const cartKeywords = ["cos", "coș", "comand", "cumpăr", "adaug", "pune"];
  const trackKeywords = ["comand", "track", "unde e", "livrare", "status"];
  const greetKeywords = ["salut", "buna", "hello", "hey", "servus", "ciao"];

  if (greetKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "general_chat",
      reply: "Salut! 👋 Bine ai venit pe AICeVrei.ro! Spune-mi ce produs cauți și îți găsesc cea mai bună ofertă. Poți încerca: \"căști wireless\", \"gadget cadou\" sau \"ceva pentru fitness\".",
    };
  }

  if (cheaperKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "find_cheaper",
      reply: "Caut o variantă mai accesibilă pentru tine... 🔍",
      searchQuery: msg,
    };
  }

  if (explainKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "explain_product",
      reply: "Hai să-ți explic mai multe despre acest produs:",
    };
  }

  if (cartKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "add_to_cart",
      reply: "Adaug produsul în coșul tău! 🛒",
    };
  }

  if (trackKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "track_order",
      reply: "Verifică statusul comenzii în contul tău Shopify. Dacă ai nevoie de ajutor, spune-mi numărul comenzii.",
    };
  }

  if (searchKeywords.some((k) => msg.includes(k)) || msg.length > 3) {
    return {
      intent: "search_product",
      reply: "Am găsit câteva opțiuni bune pentru tine! 🎯",
      searchQuery: msg,
    };
  }

  return {
    intent: "general_chat",
    reply: "Spune-mi ce produs cauți și îți găsesc cea mai bună ofertă! Poți scrie orice: \"căști\", \"gadget cadou\", \"ceva pentru sport\" etc.",
  };
}
