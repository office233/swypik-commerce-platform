/**
 * Search Suggestions — PostgreSQL-powered autocomplete
 */
import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/db/product-queries";

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const rawLimit = Number(url.searchParams.get("limit") || 8);
    const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(rawLimit, 12)) : 8;

    if (q.length < 2) return NextResponse.json({ ok: true, suggestions: [] });

    const cacheKey = `suggest_${q}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return NextResponse.json(cached.data);

    // Search products from PostgreSQL
    const result = await searchProducts({ search: q, limit: 20 });
    
    // Build suggestions from results
    const suggestions: { label: string; type: string }[] = [];
    const seenLabels = new Set<string>();

    // Add category suggestions
    const categories = new Map<string, number>();
    for (const p of result.products) {
      const cat = (p.category || "").split(" > ")[0];
      if (cat) categories.set(cat, (categories.get(cat) || 0) + 1);
    }
    for (const [cat, count] of Array.from(categories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      if (suggestions.length < limit && !seenLabels.has(cat)) {
        suggestions.push({ label: cat, type: "categorie" });
        seenLabels.add(cat);
      }
    }

    // Add product title suggestions  
    for (const p of result.products) {
      const label = p.title.length > 50 ? p.title.slice(0, 50) + "..." : p.title;
      if (suggestions.length < limit && !seenLabels.has(label)) {
        suggestions.push({ label, type: "produs" });
        seenLabels.add(label);
      }
    }

    const responseData = { ok: true, q, suggestions: suggestions.slice(0, limit) };
    cache.set(cacheKey, { data: responseData, ts: Date.now() });
    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("[Search Suggest]", error);
    return NextResponse.json({ ok: false, error: "A apărut o eroare la căutare.", suggestions: [] }, { status: 500 });
  }
}
