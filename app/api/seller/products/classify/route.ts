import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { rateLimit } from "@/lib/security/rate-limit";
import { SellerProductClassifySchema, parseBody } from "@/lib/validation/schemas";
import { chat, parseJsonLoose, isStudiAIConfigured } from "@/lib/ai/studiai";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type TaxNode = { slug: string; kind: string; parent_slug: string | null };

let _taxCache: { fetchedAt: number; nodes: TaxNode[] } | null = null;
const TAX_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadTaxonomy(): Promise<TaxNode[]> {
  const now = Date.now();
  if (_taxCache && now - _taxCache.fetchedAt < TAX_CACHE_TTL_MS) return _taxCache.nodes;
  const { rows } = await dbQuery<TaxNode>(
    `SELECT slug, kind, parent_slug FROM taxonomy_nodes WHERE is_active = true ORDER BY kind, slug`,
  );
  _taxCache = { fetchedAt: now, nodes: rows };
  return rows;
}

function buildTaxonomyText(nodes: TaxNode[]): string {
  const depts = nodes.filter((n) => n.kind === "department").map((n) => n.slug).sort();
  const lines: string[] = [];
  for (const d of depts) {
    lines.push(`# ${d}`);
    const cats = nodes.filter((n) => n.kind === "category" && n.parent_slug === d).map((n) => n.slug).sort();
    for (const c of cats) {
      lines.push(`  - ${c}`);
      const subs = nodes.filter((n) => n.kind === "subcategory" && n.parent_slug === c).map((n) => n.slug).sort();
      for (const s of subs) lines.push(`    * ${s}`);
    }
  }
  return lines.join("\n");
}

type Suggestion = { slug: string; confidence: number; label: string };

async function classifyWithLLM(title: string, description: string, taxonomyText: string): Promise<Suggestion[]> {
  if (!isStudiAIConfigured()) return [];
  const systemPrompt = `You classify Romanian e-commerce product titles into a fixed taxonomy with three levels: department > category > subcategory.

Return the THREE most likely matches, most specific first. Pick ONLY slugs that appear verbatim in the TAXONOMY below.

OUTPUT strict JSON only, no prose, no markdown fences: {"results":[{"slug":"<exact-slug>","confidence":0.0-1.0,"label":"<short RO label>"}]}

TAXONOMY:
${taxonomyText}`;
  const userMsg = JSON.stringify({ title, description: description.slice(0, 1000) });

  try {
    const text = await chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      { temperature: 0, maxTokens: 1024, responseJson: true, timeoutMs: 15_000 },
    );
    const parsed = parseJsonLoose<{ results?: Suggestion[] }>(text);
    return Array.isArray(parsed?.results) ? parsed!.results.slice(0, 3) : [];
  } catch (e) {
    logger.warn({ err: e }, "[seller/classify] studiai error");
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const rl = await rateLimit("sellerClassify", sellerId, { limit: 30, window: 60 });
    if (!rl.success) return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });

    const raw = await req.json().catch(() => null);
    const parsed = parseBody(SellerProductClassifySchema, raw);
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

    const { title, description } = parsed.data;
    const nodes = await loadTaxonomy();
    const validSlugs = new Set(nodes.map((n) => n.slug));
    const taxText = buildTaxonomyText(nodes);

    const suggestions = await classifyWithLLM(title, description || "", taxText);
    const filtered = suggestions.filter((s) => validSlugs.has(s.slug));

    return NextResponse.json({
      success: true,
      suggestions: filtered,
      top: filtered[0] || null,
    });
  } catch (error) {
    logger.error({ err: error }, "[seller/classify] error");
    return NextResponse.json({ success: false, error: "Eroare la clasificare." }, { status: 500 });
  }
}
