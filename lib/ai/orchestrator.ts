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

const SYSTEM_PROMPT = `You are the AI sales agent for AICeVrei.ro, an online store with 108,000+ products.

Objective: turn conversations into clear recommendations, smart bundles, and cart additions.

AVAILABLE CATEGORIES with product counts:
1. Women's Clothing (81,936) — Tops & Sets, Bottoms, Accessories, Outerwear, Weddings
2. Home, Garden & Furniture (5,285) — Home Storage, Kitchen, Textiles, Party Supplies
3. Men's Clothing (4,643) — Outerwear & Jackets, Bottoms, T-Shirts, Underwear
4. Jewelry & Watches (3,634) — Fashion Jewelry, Fine Jewelry, Watches, Wedding rings
5. Bags & Shoes (2,033) — Women's Shoes, Women's Bags, Men's Bags, Men's Shoes
6. Pet Supplies (1,882) — Pet Clothes, Pet Toys, Pet Furniture, Collars, Outdoor
7. Health, Beauty & Hair (1,724) — Skin Care, Makeup, Nails, Wigs, Beauty Tools
8. Toys, Kids & Babies (1,667) — Girls Clothing, Toys, Baby Clothing, Boys Clothing
9. Sports & Outdoors (1,419) — Sportswear, Swimming, Cycling, Fishing, Camping
10. Automobiles & Motorcycles (1,040) — Auto Parts, Motorcycle Parts, Car Electronics
11. Home Improvement (951) — Tools, Indoor Lighting, Outdoor Lighting, Appliances
12. Consumer Electronics (933) — Smart Electronics, Camera, Audio, Video, Accessories
13. Phones & Accessories (890) — Cases & Covers, Phone Accessories, Phone Parts
14. Computer & Office (274) — Tablet Accessories, Office Electronics, Networking

CRITICAL RULES:
- searchQuery MUST be in ENGLISH (product titles are in English).
- Romanian to English examples:
  * "haine de barbati" -> "men shirt jacket pants hoodie"
  * "rochie" -> "dress women"
  * "bijuterii" -> "necklace ring bracelet earrings"
  * "cadou" -> "gift set"
  * "sub 100 lei" -> add maxPrice: 100
  * "ceas" -> "watch men women"
  * "geanta" -> "handbag bag purse women"
  * "pantofi" -> "shoes heels boots"
  * "decoratiuni casa" -> "home decor decoration"
  * "jucarii copii" -> "toys kids children"
  * "animale" -> "pet dog cat"
  * "cosmetice" -> "makeup skincare beauty"
  * "sport fitness" -> "sportswear gym yoga leggings"
  * "electronice" -> "electronics smart gadget"
  * "husa telefon" -> "phone case cover"
  * "scule unelte" -> "tools hardware"
  * "piese auto" -> "car parts accessories"
  * "laptop" -> "laptop tablet computer accessories"
- reply MUST be in Romanian, warm, direct, like a sales consultant.
- Do NOT mention suppliers, CJ, AliExpress, dropshipping, or scraping.
- Do NOT invent exact stock numbers, real reviews, or guaranteed discounts.
- Build bundles: main product + 1-2 complementary products.
- If user says something is too expensive: intent=find_cheaper, sort=price_asc, maxPrice.

Style: 3-5 sentences. Moderate emojis. End with CTA.

Return ONLY valid JSON, no markdown:
{
  "intent": "search_product|explain_product|compare_products|find_cheaper|add_to_cart|checkout|track_order|general_chat",
  "reply": "sales response IN ROMANIAN",
  "searchQuery": "ENGLISH search query for products",
  "bundleQueries": ["complementary English query 1", "complementary English query 2"],
  "productId": "product id if clear",
  "productTitle": "product title/fragment if clear",
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

// Map Romanian search terms to English for PostgreSQL search
const RO_TO_EN: Record<string, string> = {
  "haine": "clothing",
  "rochie": "dress",
  "rochii": "dress",
  "pantaloni": "pants trousers",
  "tricou": "t-shirt tee",
  "camasa": "shirt",
  "jacheta": "jacket",
  "geaca": "jacket coat",
  "pulover": "sweater pullover",
  "hanorac": "hoodie sweatshirt",
  "fusta": "skirt",
  "bluza": "blouse top",
  "palton": "coat overcoat",
  "ceas": "watch",
  "bratara": "bracelet",
  "colier": "necklace",
  "cercei": "earrings",
  "inel": "ring",
  "incaltaminte": "shoes",
  "pantofi": "shoes heels",
  "adidasi": "sneakers sports shoes",
  "ghiozdan": "backpack bag",
  "geanta": "handbag bag purse",
  "portofel": "wallet",
  "cadou": "gift set",
  "jucarie": "toy",
  "jucarii": "toys",
  "decoratiuni": "decoration home decor",
  "lampa": "lamp light",
  "perna": "pillow cushion",
  "cana": "mug cup",
  "telefon": "phone case cover",
  "casti": "headphones earbuds",
  "cablu": "cable charger",
  "sport": "sports fitness gym",
  "yoga": "yoga leggings sports",
  "barbati": "men",
  "femei": "women",
  "copii": "kids children",
};

function translateQuery(query: string): string {
  const words = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/);
  const translated = words.map(w => RO_TO_EN[w] || w);
  return translated.join(" ");
}

function cleanCheaperQuery(message: string) {
  let cleaned = message
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
  return translateQuery(cleaned);
}

export async function orchestrate(userMessage: string, chatHistory: { role: "user" | "assistant"; content: string }[] = [], productContext: any[] = [], shoppingSession: ShoppingSession = {}): Promise<OrchestratorResult> {
  const hardCheaper = detectCheaperIntent(userMessage);
  const hardMaxPrice = extractMaxPrice(userMessage, productContext);

  if (hardCheaper) {
    const baseQuery = cleanCheaperQuery(userMessage) || productContext[0]?.category || translateQuery(userMessage);
    return {
      intent: "find_cheaper",
      reply: `Da, schimb strategia pe variante mai accesibile. ${hardMaxPrice ? `Ma tin de maxim ${hardMaxPrice} lei.` : "Iti arat alternative cu pret mai bun."} 🔥`,
      searchQuery: baseQuery,
      bundleQueries: [`${baseQuery} accessories`, `${baseQuery} gift`, `${baseQuery} set`],
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
    if (contextSummary.length) messages.push({ role: "system", content: `Products in context: ${JSON.stringify(contextSummary)}` });
    messages.push({ role: "user", content: userMessage });
    const completion = await client.chat.completions.create({ model: getModel(), messages, temperature: 0.72, max_tokens: 750 });
    const content = completion.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(cleaned);
    return { intent: result.intent || "general_chat", reply: result.reply || "Spune-mi ce cauti si iti aleg rapid varianta potrivita.", searchQuery: result.searchQuery, bundleQueries: Array.isArray(result.bundleQueries) ? result.bundleQueries.slice(0, 3) : [], productId: result.productId, productTitle: result.productTitle, maxPrice: result.maxPrice, sort: result.sort, shouldAskFollowUp: Boolean(result.shouldAskFollowUp) };
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
  if (cartKeywords.some((k) => msg.includes(k))) return { intent: "add_to_cart", reply: firstProduct ? `Perfect 🛒 Iti pun ${firstProduct.title} in cos. Iti recomand sa il iei cu inca un produs complementar.` : "Sigur 🛒 Alege produsul dorit si il punem imediat in cos.", productId: firstProduct?.id, productTitle: firstProduct?.title };
  if (checkoutKeywords.some((k) => msg.includes(k))) return { intent: "checkout", reply: "Perfect. Hai sa finalizam comanda cat mai simplu 🛒" };
  if (greetKeywords.some((k) => msg.includes(k))) return { intent: "general_chat", reply: "Salut! Spune-mi ce cauti, ce buget ai si ce stil vrei. Am 108.000+ produse si iti fac rapid un bundle bun. ✨", shouldAskFollowUp: true };
  
  // Translate Romanian query to English for searchQuery
  const translatedQuery = translateQuery(message);
  const budgetText = shoppingSession.budgetLabel ? ` in bugetul tau de ${shoppingSession.budgetLabel}` : "";
  return { intent: "search_product", reply: `Perfect, caut variante potrivite${budgetText} si iti pregatesc idei de bundle. 🔥`, searchQuery: translatedQuery, bundleQueries: [translatedQuery + " accessories", translatedQuery + " gift"], shouldAskFollowUp: true };
}
