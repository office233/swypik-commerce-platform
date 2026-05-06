import OpenAI from "openai";
import type { ShoppingSession } from "@/lib/sales/shopping-session";
import { buildSessionPrompt } from "@/lib/sales/shopping-session";

function getAIClient(): OpenAI | null {
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" });
  }
  if (process.env.OPENAI_API_KEY) return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return null;
}

function getModel(): string { return process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001"; }

export type ChatIntent = "search_product" | "explain_product" | "compare_products" | "find_cheaper" | "add_to_cart" | "checkout" | "track_order" | "general_chat";
export type OrchestratorResult = { intent: ChatIntent; reply: string; searchQuery?: string; bundleQueries?: string[]; productId?: string; productTitle?: string; shouldAskFollowUp?: boolean; maxPrice?: number; sort?: "recommended" | "price_asc" | "price_desc" | "popular" | "delivery" | "discount" };

const SYSTEM_PROMPT = `Ești agentul AI de vânzări pentru AICeVrei.ro, magazin Shopify.

Obiectiv: transformi conversația în recomandări clare, bundle-uri bune și adăugări în coș.

Reguli ferme:
- Produsele vin exclusiv din Shopify.
- Nu menționa furnizori, import, CJ, AliExpress, dropshipping sau scraping.
- Nu inventa stoc exact, cumpărători reali, recenzii reale sau reduceri garantate.
- Poți fi convingător, energic și comercial, dar fără afirmații false.
- Vorbește în română, cald, direct, ca un consultant de vânzări.
- Construiește bundle-uri: produs principal + 1-2 produse complementare.
- Adaptează răspunsul după contextul clientului: buget, pentru cine cumpără, stil, ocazie, sensibilitate la preț.
- Dacă userul spune că e prea scump, cere ceva mai ieftin sau pare sensibil la preț: returnează intent=find_cheaper, sort=price_asc și un maxPrice realist dacă se poate deduce.
- Dacă userul cere alternative/comparație: returnează intent=find_cheaper sau compare_products și searchQuery curățat.
- Când clientul caută ceva, returnează search_product, searchQuery și 1-3 bundleQueries.
- Când clientul vrea să cumpere/adauge, returnează add_to_cart și productId/productTitle dacă este clar.
- Când clientul este indecis, pune maxim 2 întrebări și recomandă un traseu de cumpărare.

Stil:
- 4-7 propoziții când vinzi.
- Emoji-uri moderate: 🔥 ✨ 🎁 💎 🛒
- Închide cu CTA: „Îți pun prima variantă în coș?”, „Vrei bundle complet?”, „Îți arăt varianta mai ieftină?”.

Returnează mereu JSON valid, fără markdown:
{
  "intent": "search_product|explain_product|compare_products|find_cheaper|add_to_cart|checkout|track_order|general_chat",
  "reply": "răspuns de vânzare în română",
  "searchQuery": "query română pentru Shopify",
  "bundleQueries": ["query complementar 1", "query complementar 2"],
  "productId": "id produs dacă este clar",
  "productTitle": "titlu/fragment produs dacă este clar",
  "maxPrice": 100,
  "sort": "price_asc|recommended|price_desc|popular|delivery|discount",
  "shouldAskFollowUp": true
}`;

function detectCheaperIntent(message: string) {
  const msg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /scump|prea mult|mai ieftin|ieftin|buget|sub\s*\d+|maxim\s*\d+|pana la\s*\d+|alternativa|alternative/.test(msg);
}

function extractMaxPrice(message: string, productContext: any[] = []) {
  const msg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const explicit = msg.match(/(?:sub|maxim|pana la)\s*(\d{2,5})/) || msg.match(/(\d{2,5})\s*(?:lei|ron)/);
  if (explicit?.[1]) return Number(explicit[1]);
  const prices = productContext.map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length) return Math.max(50, Math.floor(Math.min(...prices) * 0.8));
  return undefined;
}

function cleanCheaperQuery(message: string) {
  return message
    .replace(/prea scump/gi, "")
    .replace(/mai ieftin/gi, "")
    .replace(/ieftin/gi, "")
    .replace(/buget/gi, "")
    .replace(/alternative?/gi, "")
    .replace(/sub\s*\d{2,5}/gi, "")
    .replace(/maxim\s*\d{2,5}/gi, "")
    .replace(/pana la\s*\d{2,5}/gi, "")
    .replace(/\d{2,5}\s*(lei|ron)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function orchestrate(userMessage: string, chatHistory: { role: "user" | "assistant"; content: string }[] = [], productContext: any[] = [], shoppingSession: ShoppingSession = {}): Promise<OrchestratorResult> {
  const hardCheaper = detectCheaperIntent(userMessage);
  const hardMaxPrice = extractMaxPrice(userMessage, productContext);

  if (hardCheaper) {
    const baseQuery = cleanCheaperQuery(userMessage) || productContext[0]?.category || productContext[0]?.title || userMessage;
    return {
      intent: "find_cheaper",
      reply: `Da, schimb strategia pe variante mai accesibile. Îți caut produse mai ieftine, dar păstrez ideea de calitate și aleg opțiuni care merită puse în coș. ${hardMaxPrice ? `Mă țin de maxim ${hardMaxPrice} lei.` : "Îți arăt alternative cu preț mai bun."} 🔥`,
      searchQuery: baseQuery,
      bundleQueries: [`${baseQuery} accesorii ieftine`, `${baseQuery} cadou buget`, `${baseQuery} ofertă`],
      maxPrice: hardMaxPrice,
      sort: "price_asc",
      shouldAskFollowUp: false,
    };
  }

  const client = getAIClient();
  if (!client) return fallbackOrchestrate(userMessage, productContext, shoppingSession);

  try {
    const contextSummary = productContext.slice(0, 10).map((p) => ({ id: p.id, title: p.title, price: p.price, category: p.category, rating: p.rating, orders: p.orders }));
    const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }, { role: "system", content: buildSessionPrompt(shoppingSession) }, ...chatHistory.slice(-10)];
    if (contextSummary.length) messages.push({ role: "system", content: `Produse Shopify în context: ${JSON.stringify(contextSummary)}` });
    messages.push({ role: "user", content: userMessage });
    const completion = await client.chat.completions.create({ model: getModel(), messages, temperature: 0.72, max_tokens: 750 });
    const content = completion.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(cleaned);
    return { intent: result.intent || "general_chat", reply: result.reply || "Spune-mi ce cauți și îți aleg rapid varianta potrivită.", searchQuery: result.searchQuery, bundleQueries: Array.isArray(result.bundleQueries) ? result.bundleQueries.slice(0, 3) : [], productId: result.productId, productTitle: result.productTitle, maxPrice: result.maxPrice, sort: result.sort, shouldAskFollowUp: Boolean(result.shouldAskFollowUp) };
  } catch (error) {
    console.error("[AI Orchestrator] Error:", error);
    return fallbackOrchestrate(userMessage, productContext, shoppingSession);
  }
}

function fallbackOrchestrate(message: string, productContext: any[] = [], shoppingSession: ShoppingSession = {}): OrchestratorResult {
  const msg = message.toLowerCase().trim();
  const firstProduct = productContext[0];
  const cartKeywords = ["adauga", "adaugă", "pune", "cos", "coș", "cumpar", "cumpăr", "iau", "vreau asta"];
  const checkoutKeywords = ["checkout", "finalizeaza", "finalizează", "platesc", "plătesc", "comanda", "comandă"];
  const greetKeywords = ["salut", "buna", "bună", "hello", "hey", "servus"];
  if (cartKeywords.some((k) => msg.includes(k))) return { intent: "add_to_cart", reply: firstProduct ? `Perfect 🛒 Îți pun ${firstProduct.title} în coș. Îți recomand să îl iei cu încă un produs complementar ca să faci un bundle mai complet.` : "Sigur 🛒 Alege produsul dorit din carousel și îl punem imediat în coș.", productId: firstProduct?.id, productTitle: firstProduct?.title };
  if (checkoutKeywords.some((k) => msg.includes(k))) return { intent: "checkout", reply: "Perfect. Hai să finalizăm comanda cât mai simplu 🛒" };
  if (greetKeywords.some((k) => msg.includes(k))) return { intent: "general_chat", reply: "Salut! Spune-mi pentru cine cumperi, ce buget ai și ce stil vrei. Îți fac rapid un bundle bun din produse Shopify și îți spun ce merită pus în coș. ✨", shouldAskFollowUp: true };
  const budgetText = shoppingSession.budgetLabel ? ` în bugetul tău de ${shoppingSession.budgetLabel}` : "";
  return { intent: "search_product", reply: `Perfect, caut variante potrivite${budgetText} și îți pregătesc idei de bundle ca să alegi mai ușor. 🔥`, searchQuery: message, bundleQueries: [message + " accesorii", message + " cadou", message + " premium"], shouldAskFollowUp: true };
}
