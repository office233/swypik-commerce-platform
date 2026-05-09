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

export type ChatIntent = "search_product" | "explain_product" | "compare_products" | "find_cheaper" | "refine_search" | "add_to_cart" | "checkout" | "track_order" | "general_chat";
export type OrchestratorResult = { intent: ChatIntent; reply: string; searchQuery?: string; bundleQueries?: string[]; productId?: string; productTitle?: string; shouldAskFollowUp?: boolean; maxPrice?: number; sort?: "recommended" | "price_asc" | "price_desc" | "popular" | "delivery" | "discount"; excludeIds?: string[] };

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

IMPORTANT CONVERSATION RULES:
- If user says "nu-mi place", "altceva", "altele", "alte optiuni", "nu asta", "schimba" → intent=refine_search, reuse the SAME searchQuery but different results
- If user says "mai mare", "mai mic", "alta culoare", "alt stil" → intent=refine_search, adjust searchQuery
- If user references previous products ("primul", "al doilea", "ala rosu") → use productContext to identify
- REMEMBER the conversation context — what user liked/disliked, their budget, style preferences
- When refining, acknowledge what they didn't like and explain how the new results are different

Return ONLY valid JSON, no markdown:
{
  "intent": "search_product|explain_product|compare_products|find_cheaper|refine_search|add_to_cart|checkout|track_order|general_chat",
  "reply": "sales response IN ROMANIAN",
  "searchQuery": "ENGLISH search query for products",
  "bundleQueries": ["complementary English query 1", "complementary English query 2"],
  "productId": "product id if clear",
  "productTitle": "product title/fragment if clear",
  "maxPrice": 100,
  "sort": "price_asc|recommended|price_desc|popular|delivery|discount",
  "shouldAskFollowUp": true
}`;

function detectCheaperIntent(message: string, hasProductContext: boolean) {
  const msg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Strong cheaper signals — always trigger
  if (/scump|prea mult|mai ieftin|ieftin|alternativa|alternative/.test(msg)) return true;
  // Budget signals (sub X, maxim X) — only trigger if user already has product context (refinement, not initial search)
  if (hasProductContext && /buget|sub\s*\d+|maxim\s*\d+|pana la\s*\d+/.test(msg)) return true;
  return false;
}

function detectCompareIntent(message: string) {
  const msg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /compar|compara|versus|vs|diferenta|diferente|asta sau|care e mai|primele 2|top 2/.test(msg);
}

function detectRefineIntent(message: string) {
  const msg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /nu-mi place|nu imi place|altceva|altele|alte optiuni|nu asta|schimba|diferit|mai mare|mai mic|alta culoare|alt stil|alt model|nu vreau|arata altele|mai arata|alte variante|nu e ce cautam/.test(msg);
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
  // Gaming & Tech
  "gaming": "gaming",
  "setup": "keyboard",
  "tastatura": "keyboard",
  "monitor": "monitor",
  "mouse": "mouse",
  "birou": "desk",
  "lumini": "led light",
  "pc": "computer",
  "calculator": "computer",
  "consola": "gamepad",
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
  const hasProductContext = productContext.length > 0;
  const hardCheaper = detectCheaperIntent(userMessage, hasProductContext);
  const hardMaxPrice = extractMaxPrice(userMessage, productContext);

  // ─── COMPARE DETECTION ───
  const hardCompare = detectCompareIntent(userMessage);
  if (hardCompare && hasProductContext && productContext.length >= 2) {
    const p1 = productContext[0];
    const p2 = productContext[1];
    const winner = (p1.rating || 0) > (p2.rating || 0) ? p1 : (p1.price || 999) < (p2.price || 999) ? p1 : p2;
    return {
      intent: "compare_products",
      reply: `⚖️ **Comparație rapidă:**\n\n` +
        `**1. ${p1.title?.slice(0, 50)}**\n` +
        `   💰 ${p1.price} lei | ⭐ ${p1.rating || '?'} | 📦 ${p1.orders || 0}+ comenzi\n\n` +
        `**2. ${p2.title?.slice(0, 50)}**\n` +
        `   💰 ${p2.price} lei | ⭐ ${p2.rating || '?'} | 📦 ${p2.orders || 0}+ comenzi\n\n` +
        `🏆 **Recomandare AI:** ${winner.title?.slice(0, 40)} — ${winner === p1 ? 'preț/calitate mai bun' : 'raport calitate-preț superior'}. Vrei să-l adaugi în coș?`,
      productId: winner.id,
      productTitle: winner.title,
      shouldAskFollowUp: true,
    };
  }

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

  // ─── REFINE DETECTION ("nu-mi place", "altceva", etc.) ───
  const hardRefine = detectRefineIntent(userMessage);
  if (hardRefine && productContext.length > 0) {
    const lastCategory = productContext[0]?.category;
    const lastQuery = productContext[0]?.title?.split(" ").slice(0, 3).join(" ") || lastCategory || "";
    const translatedLastQuery = translateQuery(lastQuery);
    return {
      intent: "refine_search",
      reply: `Am înțeles, îți arăt variante diferite! 🔄 Caut alte opțiuni care s-ar potrivi mai bine gusturilor tale.`,
      searchQuery: translatedLastQuery || translateQuery(userMessage),
      excludeIds: productContext.map((p: any) => String(p.id)),
      shouldAskFollowUp: true,
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
    return { intent: result.intent || "general_chat", reply: result.reply || "Spune-mi ce cauti si iti aleg rapid varianta potrivita.", searchQuery: result.searchQuery, bundleQueries: Array.isArray(result.bundleQueries) ? result.bundleQueries.slice(0, 3) : [], productId: result.productId, productTitle: result.productTitle, maxPrice: result.maxPrice, sort: result.sort, shouldAskFollowUp: Boolean(result.shouldAskFollowUp), excludeIds: result.intent === "refine_search" ? productContext.map((p: any) => String(p.id)) : undefined };
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
  const cleanedMsg = message
    .replace(/sub\s*\d{2,5}/gi, "").replace(/maxim\s*\d{2,5}/gi, "")
    .replace(/pana la\s*\d{2,5}/gi, "").replace(/\d{2,5}\s*(lei|ron)/gi, "")
    .replace(/complet/gi, "").replace(/\s+/g, " ").trim();
  const translatedQuery = translateQuery(cleanedMsg || message);
  const maxPriceMatch = message.match(/(?:sub|maxim|pana la)\s*(\d{2,5})/i);
  const maxPrice = maxPriceMatch ? Number(maxPriceMatch[1]) : undefined;
  const budgetText = maxPrice ? ` in bugetul tau de maxim ${maxPrice} lei` : (shoppingSession.budgetLabel ? ` in bugetul tau de ${shoppingSession.budgetLabel}` : "");
  return { intent: "search_product", reply: `Perfect, caut variante potrivite${budgetText} si iti pregatesc idei de bundle. 🔥`, searchQuery: translatedQuery, bundleQueries: [translatedQuery + " accessories", translatedQuery + " gift"], maxPrice, shouldAskFollowUp: true };
}
