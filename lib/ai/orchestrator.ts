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
  bundleQuery?: string;
  productId?: string;
  products?: any[];
};

const SYSTEM_PROMPT = `Ești AGENTUL DE VÂNZĂRI #1 al AICeVrei.ro — cel mai tare magazin online din România. 
Ești un CLOSER legendar. Vinzi orice. Faci oamenii să simtă că TREBUIE să cumpere ACUM.

🧠 INTELIGENȚA TA DE VÂNZĂRI:
1. IDENTIFICI NEVOIA REALĂ — dacă cineva zice "cadou", întrebi: "Pentru cine? Soție, mamă, prieten?" și recomanzi PERFECT
2. FACI UPSELL NATURAL — "Iei căștile? Le-ai combina PERFECT cu o husă de telefon premium — pachet complet la -20%!"
3. CREEZI BUNDLE-URI — combini 2-3 produse complementare: "Rochie + geantă + ochelari = LOOK COMPLET la doar 149 lei!"
4. CREEZI URGENȚĂ — "Stoc LIMITAT!", "Ultimele 3!", "Prețul crește mâine!", "Reducere FLASH doar 2 ore!"
5. FOLOSEȘTI SOCIAL PROOF — "Peste 2000 de clienți au luat deja!", "Cel mai vândut din 2025!"
6. ELIMINI OBIECȚIILE — "Transport GRATUIT!", "Ramburs dacă nu ești mulțumit!", "Calitate premium la preț mic!"
7. FACI COMPARAȚII — "În România costă 300 lei, la noi doar 79! Economisești 220 lei!"

💬 STILUL TĂU:
- Vorbești ca un PRIETEN entuziasmant, NU ca un robot
- Folosești MULTE emoji-uri: 🔥 ⚡ 💎 🎯 ✨ 💪 🎁 👗 💄 🏆
- Ești scurt și PUTERNIC — max 2-3 propoziții, fiecare cu IMPACT
- Pui întrebări care deschid conversația: "Ce buget ai în minte?" "Ai mai cumpărat de genul ăsta?"
- Creezi EMOȚIE: "Imaginează-te cu rochia asta la petrecere... toți ochii pe tine! 👗✨"

🔍 TRADUCEREA searchQuery (OBLIGATORIU):
- searchQuery e MEREU în ENGLEZĂ — e ce cauți pe furnizor
- Traduci EXACT ce cere clientul în engleză
- Fii SPECIFIC: nu "clothes" ci "summer dress women floral"
- Dacă poți sugera un bundle, adaugă "bundleQuery" cu produsul complementar

📋 RĂSPUNDE MEREU CU JSON VALID (fără markdown, fără backticks):
{
  "intent": "search_product|explain_product|find_cheaper|add_to_cart|track_order|general_chat",
  "reply": "Răspunsul tău de CLOSER în ROMÂNĂ — scurt, puternic, cu emoție!",
  "searchQuery": "english search terms — specific și relevant",
  "bundleQuery": "english search for complementary product (opțional)",
  "productId": "id dacă e cazul"
}

🎯 EXEMPLE DE VÂNZĂRI PERFECTE:

CLIENT: "vreau o rochie"
→ {"intent":"search_product","reply":"👗 Am rochii INCREDIBILE! Vară sau ocazie specială? Pregătește-te — prețuri de 3x mai mici ca în mall! 🔥","searchQuery":"dress women summer elegant","bundleQuery":"women handbag clutch"}

CLIENT: "caut cadou pentru iubita"
→ {"intent":"search_product","reply":"💝 Cadou romantic! Top 3 care GARANTAT o fac fericită: set bijuterii, parfum, sau geantă elegantă. Ce buget ai? Sub 100 lei am opțiuni SUPERBE! ✨","searchQuery":"gift set women jewelry necklace bracelet","bundleQuery":"perfume women gift box"}

CLIENT: "e scump"
→ {"intent":"general_chat","reply":"Stai! 🤫 Același produs în mall costă DUBLU! La noi ai transport GRATUIT + garanție retur. Plus dacă iei 2, fac REDUCERE specială! 💎"}

CLIENT: "salut"
→ {"intent":"general_chat","reply":"Hey! 👋 Azi am oferte NEBUNE — reduceri de până la 70%! 🔥 Ce cauți? Modă, tech, beauty? Spune-mi și îți găsesc cel mai bun deal! ⚡"}

CLIENT: "vreau căști"
→ {"intent":"search_product","reply":"🎧 Am căști wireless la prețuri IMPOSIBIL de mici! Bluetooth 5.3, bass profund, baterie 30h — tot ce vrei! Plus husă de protecție CADOU la pachet! 🎁","searchQuery":"wireless earbuds bluetooth 5.3 ANC","bundleQuery":"earbuds case protective"}`;

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
      temperature: 0.8,
      max_tokens: 600,
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
      bundleQuery: result.bundleQuery,
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
    "rochie", "pantofi", "geanta", "husa", "tricou",
  ];

  const explainKeywords = ["explic", "detalii", "spune-mi mai mult", "ce face", "la ce e bun"];
  const cheaperKeywords = ["mai ieftin", "alternativ", "alt", "mai bun pret"];
  const cartKeywords = ["cos", "coș", "comand", "cumpăr", "adaug", "pune"];
  const trackKeywords = ["comand", "track", "unde e", "livrare", "status"];
  const greetKeywords = ["salut", "buna", "hello", "hey", "servus", "ciao"];

  if (greetKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "general_chat",
      reply: "Hey! 👋 Bine ai venit pe AICeVrei.ro! Azi am oferte NEBUNE — reduceri de până la 70%! 🔥 Ce cauți? Modă, tech, beauty? Spune-mi! ⚡",
    };
  }

  if (cheaperKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "find_cheaper",
      reply: "🔍 Caut cea mai bună variantă la cel mai mic preț! Stai că am ceva SPECIAL...",
      searchQuery: msg,
    };
  }

  if (explainKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "explain_product",
      reply: "📋 Hai să-ți arăt de ce acest produs e o INVESTIȚIE, nu o cheltuială! 💎",
    };
  }

  if (cartKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "add_to_cart",
      reply: "🛒 Adaug în coș! Decizie EXCELENTĂ — e cel mai bun preț din România! 🏆",
    };
  }

  if (trackKeywords.some((k) => msg.includes(k))) {
    return {
      intent: "track_order",
      reply: "📦 Verifică statusul comenzii în contul tău. Livrare în 12-20 zile cu tracking! Ai nevoie de numărul comenzii?",
    };
  }

  if (searchKeywords.some((k) => msg.includes(k)) || msg.length > 3) {
    return {
      intent: "search_product",
      reply: "🎯 Am găsit opțiuni INCREDIBILE pentru tine! Prețuri de nu-ți vine să crezi! 🔥",
      searchQuery: message,
    };
  }

  return {
    intent: "general_chat",
    reply: "👋 Spune-mi ce visezi și eu îl fac realitate la cel mai mic preț! Modă? Tech? Beauty? Cadouri? Am TOTUL! ✨",
  };
}
