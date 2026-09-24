import { describe, it, expect, vi, beforeEach } from "vitest";

const inserts: string[] = [];

vi.mock("@/lib/db", () => ({
  dbQuery: vi.fn(async (sql: string) => {
    if (/INSERT INTO news_(articles|raw_items|article_sources)/.test(sql)) inserts.push(sql);
    if (sql.includes("FROM news_sources")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/news/repository", () => ({ countArticlesPublishedToday: vi.fn(async () => 0) }));

import { generateAutonomousNewsArticle } from "@/lib/news/ai-journalist";
import { runNewsIngestionPipeline } from "@/lib/news/rss-ingester";

describe("news pipeline never fabricates articles", () => {
  beforeEach(() => {
    inserts.length = 0;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("returns null (no template article) when no AI key is configured", async () => {
    const out = await generateAutonomousNewsArticle({
      title: "Real headline from a feed",
      source: "BBC",
      summary: "Some summary",
      url: "https://bbc.co.uk/x",
      categoryHint: "business",
    });
    expect(out).toBeNull();
  });

  it("publishes nothing when every live feed is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const res = await runNewsIngestionPipeline();
    expect(res.ingested).toBe(0);
    expect(inserts).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
