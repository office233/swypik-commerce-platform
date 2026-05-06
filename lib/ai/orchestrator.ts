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

export type ChatIntent =
  | "search_product"
  | "explain_product"
  | "compare_products"
  | "find_cheaper"
  | "add_to_cart"
  | "checkout"
  | "track_order"
  | "general_chat";

export type OrchestratorResult = {
  intent: ChatIntent;
  reply: string;
  searchQuery?: string;
  productId?: string;
  productTitle?: string;
  shouldAskFollowUp?: boolean;
};

const SYSTEM_PROMPT = `Ești agentul AI de vânzări pentru AICeVrei.ro, un magazin Shopify.

Reguli:
- Produsele vin exclusiv din Shopify.
- Nu menționa furnizori, import, CJ, AliExpress, dropshipping sau scraping.
- Nu inventa stoc exact, reduceri garantate, comenzi reale sau recenzii reale.
- Fii conversațional, util, cald și orientat spre vânzare.
- Răspunde în română.
- Când clientul caută ceva, returnează search_product și un searchQuery în română pentru căutare Shopify.
- Când clientul vrea să cumpere sau să adauge în coș, returnează add_to_cart și productId/productTitle dacă produsul este clar din context.
- Când clientul e nehotărât, pune întrebări scurte despre buget, persoană, stil, mărime sau ocazie.
- Încheie natural cu un pas următor: „Îți arăt variante?”, „Vrei să îl pun în coș?”, „Ce buget ai?”.

Returnează mereu JSON valid, fără markdown:
{
  "intent": "search_product|explain_product|compare_products|find_cheaper|add_to_cart|checkout|track_order|general_chat",
  "reply": "răspuns în română",
  "searchQuery": "query în română pentru Shopify, dacă este cazul",
  "productId": "id produs dacă este clar",
  "productTitle": "titlu/fragment produs dacă este clar",
  "shouldAskFollowUp": true
}`;

export async function orchestrate(
  userMessage: string,
  chatHistory: { role: "user" | "assistant"; content: string }[] = [],
  productContext: any[] = []
): Promise<OrchestratorResult> {
  const client = getAIClient();

  if (!client) return fallbackOrchestrate(userMessage, productContext);

  try {
    const contextSummary = productContext.slice(0, 8).map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      category: p.category,
    }));

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...chatHistory.slice(-10),
    ];

    if (contextSummary.length > 0) {
      messages.push({
        role: "system",
        content: `Produse Shopify în context: ${JSON.stringify(contextSummary)}`,
      });
    }

    messages.push({ role: "user", content: userMessage });

    const completion = await client.chat.completions.create({
      model: getModel(),
      messages,
      temperature: 0.55,
      max_tokens: 600,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(cleaned);

    return {
      intent: result.intent || "general_chat",
      reply: result.reply || "Spune-mi ce cauți și te ajut să alegem ceva potrivit.",
      searchQuery: result.searchQuery,
      productId: result.productId,
      productTitle: result.productTitle,
      shouldAskFollowUp: Boolean(result.shouldAskFollowUp),
    };
  } catch (error) {
    console.error("[AI Orchestrator] Error:", error);
    return fallbackOrchestrate(userMessage, productContext);
  }
}

function fallbackOrchestrate(message: string, productContext: any[] = []): OrchestratorResult {
  const msg = message.toLowerCase().trim();
  const firstProduct = productContext[0];

  const cartKeywords = ["adauga", "adaugă", "pune", "cos", "coș", "cumpar", "cumpăr", "iau", "vreau asta"];
  const checkoutKeywords = ["checkout", "finalizeaza", "finalizează", "platesc", "plătesc", "comanda", "comandă"];
  const greetKeywords = ["salut", "buna", "bună", "hello", "hey", "servus"];

  if (cartKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "add_to_cart",
      reply: firstProduct
        ? `Sigur, îl putem pune în coș: ${firstProduct.title}.`
        : "Sigur. Spune-mi exact produsul sau alege unul din rezultate și îl punem în coș.",
      productId: firstProduct?.id,
      productTitle: firstProduct?.title,
    };
  }

  if (checkoutKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "checkout",
      reply: "Perfect. Mergem spre finalizarea comenzii.",
    };
  }

  if (greetKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "general_chat",
      reply: "Salut! Spune-mi ce cauți, pentru cine este și ce buget ai, iar eu îți recomand rapid variante potrivite din magazin.",
      shouldAskFollowUp: true,
    };
  }

  if (msg.length > 2) {
    return {
      intent: "search_product",
      reply: "Caut în magazin variante potrivite pentru tine.",
      searchQuery: message,
    };
  }

  return {
    intent: "general_chat",
    reply: "Spune-mi ce cauți și te ajut să alegem produsul potrivit.",
    shouldAskFollowUp: true,
  };
}
