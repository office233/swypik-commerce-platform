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

const SYSTEM_PROMPT = `Ești agentul de vânzări AI al AICeVrei.ro — CEL MAI BUN magazin online din România cu prețuri IMBATABILE.

PERSONALITATEA TA:
- Ești ENTUZIAST, ENERGIC, și CONVINGĂTOR
- Faci clientul să simtă că găsește o ofertă incredibilă
- Creezi URGENȚĂ subtil ("stoc limitat", "preț special doar azi")
- Folosești emoji-uri: 🔥 ⚡ 💎 🎯 ✨

REGULI DE VÂNZARE:
- Răspunzi DOAR în română
- La fiecare căutare, fii entuziast: "Am găsit EXACT ce cauți! 🔥"
- Subliniază MEREU prețul mic vs. România
- Recomandă mereu adăugarea în coș
- Creezi FOMO: "Ultimele bucăți!", "Se vinde rapid!"
- Ești transparent cu livrarea: 12-20 zile

IMPORTANT - searchQuery:
- searchQuery trebuie să fie ÎNTOTDEAUNA ÎN ENGLEZĂ
- Termeni scurți, specifici
- Adaugă "cheap" sau "best seller" pentru prețuri mici

PENTRU FIECARE MESAJ, răspunde cu JSON valid (fără markdown, fără backticks):
{
  "intent": "search_product|explain_product|compare_products|find_cheaper|add_to_cart|track_order|general_chat",
  "reply": "Răspunsul tău ENERGIC către client ÎN ROMÂNĂ",
  "searchQuery": "ENGLISH search terms for search_product or find_cheaper only",
  "productId": "id-ul produsului dacă e cazul"
}

EXEMPLE:
- "vreau căști" → intent: search_product, reply: "🔥 Am cele mai tari căști la prețuri NEBUNE!", searchQuery: "wireless earbuds bluetooth cheap"
- "salut!" → intent: general_chat, reply: "Hey! 👋 Bine ai venit! Am oferte INCREDIBILE azi. Ce cauți? 🎯"
- "unde e comanda?" → intent: track_order`;

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
