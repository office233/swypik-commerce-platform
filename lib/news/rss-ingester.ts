import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateAutonomousNewsArticle } from "./ai-journalist";
import { countArticlesPublishedToday } from "./repository";

export interface FeedTopic {
  title: string;
  source: string;
  summary: string;
  url: string;
  category: "tech-ai" | "gaming" | "business" | "science";
}

const ALLOWED_CATEGORIES: FeedTopic["category"][] = ["tech-ai", "gaming", "business", "science"];

// Hard caps — LLM safety (env-configurable, sane defaults).
const MAX_ARTICLES_PER_RUN = Number(process.env.NEWS_MAX_ARTICLES_PER_RUN) > 0
  ? Math.trunc(Number(process.env.NEWS_MAX_ARTICLES_PER_RUN))
  : 20;
const MAX_ARTICLES_PER_DAY = Number(process.env.NEWS_MAX_ARTICLES_PER_DAY) > 0
  ? Math.trunc(Number(process.env.NEWS_MAX_ARTICLES_PER_DAY))
  : 60;

// Fallback RSS list — only used when news_sources is empty (fresh install
// before the seed data from the migration has been applied, or table wiped).
const FALLBACK_RSS_SOURCES: { category: FeedTopic["category"]; source: string; feedUrl: string }[] = [
  { category: "tech-ai", source: "TechCrunch", feedUrl: "https://techcrunch.com/feed/" },
  { category: "tech-ai", source: "Hacker News", feedUrl: "https://news.ycombinator.com/rss" },
  { category: "gaming", source: "IGN", feedUrl: "https://feeds.feedburner.com/ign/all" },
  { category: "business", source: "BBC Business", feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { category: "science", source: "ScienceDaily", feedUrl: "https://www.sciencedaily.com/rss/top/science.xml" },
];

// Imagini premium Unsplash de înaltă rezoluție, calibrate pe categorii
const CATEGORY_COVERS: Record<string, string[]> = {
  "tech-ai": [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80",
  ],
  "gaming": [
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&auto=format&fit=crop&q=80",
  ],
  "business": [
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
  ],
  "science": [
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1200&auto=format&fit=crop&q=80",
  ],
};

function parseLiveRssItems(xmlText: string, category: FeedTopic["category"], sourceName: string): FeedTopic[] {
  const results: FeedTopic[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const items = xmlText.match(itemRegex) || [];

  for (const itemXml of items.slice(0, 3)) {
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const url = linkMatch ? linkMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    let summary = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    if (summary.length > 280) {
      summary = summary.slice(0, 277) + "...";
    }

    if (title && url) {
      results.push({
        title,
        url,
        summary: summary || title,
        source: sourceName,
        category,
      });
    }
  }

  return results;
}

interface ActiveSourceRow {
  id: string;
  name: string;
  feed_url: string;
  category_slug: string | null;
}

/** Reads enabled sources from news_sources; falls back to the hardcoded list only if the table is empty. */
async function loadActiveSources(targetCategory?: string): Promise<{
  id: string | null;
  category: FeedTopic["category"];
  source: string;
  feedUrl: string;
}[]> {
  try {
    const { rows } = await dbQuery<ActiveSourceRow>(
      `SELECT s.id, s.name, s.feed_url, c.slug as category_slug
       FROM news_sources s
       LEFT JOIN news_categories c ON c.id = s.category_id
       WHERE s.is_active = true
       ORDER BY s.name ASC`
    );

    if (rows.length > 0) {
      return rows
        // Surse din categorii retrase nu se mai citesc.
        .filter((r) => r.category_slug === null || ALLOWED_CATEGORIES.includes(r.category_slug as FeedTopic["category"]))
        .map((r) => ({
          id: r.id,
          category: (ALLOWED_CATEGORIES.includes(r.category_slug as FeedTopic["category"])
            ? (r.category_slug as FeedTopic["category"])
            : "tech-ai") as FeedTopic["category"],
          source: r.name,
          feedUrl: r.feed_url,
        }))
        .filter((s) => !targetCategory || targetCategory === "all" || s.category === targetCategory);
    }
  } catch (err) {
    logger.warn({ err }, "[news] failed to load news_sources, falling back to hardcoded list");
  }

  return FALLBACK_RSS_SOURCES
    .filter((s) => !targetCategory || targetCategory === "all" || s.category === targetCategory)
    .map((s) => ({ id: null, ...s }));
}

async function markSourceFetched(sourceId: string | null): Promise<void> {
  if (!sourceId) return;
  try {
    await dbQuery(`UPDATE news_sources SET last_fetched_at = now() WHERE id = $1`, [sourceId]);
  } catch (err) {
    logger.warn({ err, sourceId }, "[news] failed to update news_sources.last_fetched_at");
  }
}

export async function runNewsIngestionPipeline(
  targetCategory?: string
): Promise<{ ingested: number; categoriesProcessed: string[]; capped: boolean }> {
  let count = 0;
  const processedCats = new Set<string>();

  const alreadyToday = await countArticlesPublishedToday().catch(() => 0);
  const remainingToday = Math.max(0, MAX_ARTICLES_PER_DAY - alreadyToday);
  const runCap = Math.min(MAX_ARTICLES_PER_RUN, remainingToday);

  if (runCap <= 0) {
    logger.warn({ alreadyToday, MAX_ARTICLES_PER_DAY }, "[news] daily generation cap reached, skipping run");
    return { ingested: 0, categoriesProcessed: [], capped: true };
  }

  const activeSources = await loadActiveSources(targetCategory);

  // Încercăm întâi să colectăm știri în timp real din feed-urile RSS live
  const liveTopics: FeedTopic[] = [];
  for (const src of activeSources.slice(0, 6)) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(src.feedUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "SwypikNewsBot/2.0 (+https://swypik.com)" },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const xml = await res.text();
        const parsed = parseLiveRssItems(xml, src.category, src.source);
        liveTopics.push(...parsed);
        await markSourceFetched(src.id);
      }
    } catch (err) {
      logger.debug({ err, feedUrl: src.feedUrl }, "[news] live feed unavailable, using curated fallback");
    }
  }

  // Doar știri reale din feed-urile RSS live — fără subiecte inventate.
  const pool = liveTopics;
  const candidateTopics = targetCategory && targetCategory !== "all"
    ? pool.filter((t) => t.category === targetCategory)
    : pool;

  for (const topic of candidateTopics) {
    if (count >= runCap) break;

    try {
      // 1. Verificăm dacă articolul există deja după URL
      const checkRes = await dbQuery(
        `SELECT id FROM news_raw_items WHERE url = $1 LIMIT 1`,
        [topic.url]
      );
      if (checkRes.rows.length > 0) continue;

      // 2. Jurnalistul AI scrie articolul în limba română. Fără rezultat valid
      //    (cheie lipsă, eroare, output respins de validator) nu publicăm nimic.
      const generated = await generateAutonomousNewsArticle({
        ...topic,
        categoryHint: topic.category,
      });
      if (!generated) continue;

      // 3. Înregistrăm în news_raw_items (doar subiectele efectiv procesate)
      await dbQuery(
        `INSERT INTO news_raw_items (url, title, raw_content, author, published_at, is_processed, category_hint)
         VALUES ($1, $2, $3, $4, now(), true, $5)`,
        [topic.url, topic.title, topic.summary, topic.source, topic.category]
      );

      // 4. Obținem category_id corespunzător
      const finalCategorySlug = generated.category_slug || topic.category;
      const catRes = await dbQuery<{ id: string }>(
        `SELECT id FROM news_categories WHERE slug = $1 LIMIT 1`,
        [finalCategorySlug]
      );
      const categoryId = catRes.rows[0]?.id;
      if (!categoryId) continue;

      // Imagine editorială de înaltă rezoluție
      const covers = CATEGORY_COVERS[finalCategorySlug] || CATEGORY_COVERS["tech-ai"];
      const coverUrl = covers[count % covers.length];

      // 5. Publicăm articolul în news_articles
      const inserted = await dbQuery<{ id: string }>(
        `INSERT INTO news_articles (
          slug, category_id, title, summary_tldr, content_markdown,
          cover_image_url, is_breaking, reading_time_minutes, fact_check_score,
          fact_check_notes, status, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'published', now())
        ON CONFLICT (slug) DO UPDATE SET
          title = EXCLUDED.title,
          summary_tldr = EXCLUDED.summary_tldr,
          content_markdown = EXCLUDED.content_markdown,
          fact_check_score = EXCLUDED.fact_check_score,
          updated_at = now()
        RETURNING id`,
        [
          generated.slug,
          categoryId,
          generated.title,
          generated.summary_tldr,
          generated.content_markdown,
          coverUrl,
          generated.is_breaking,
          generated.reading_time_minutes,
          generated.fact_check_score,
          generated.fact_check_notes,
        ]
      );

      // 6. Salvăm sursa originală pentru transparență
      if (inserted.rows[0]?.id) {
        await dbQuery(
          `INSERT INTO news_article_sources (article_id, original_url, original_title)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [inserted.rows[0].id, topic.url, topic.title]
        );
      }

      processedCats.add(finalCategorySlug);
      count++;
    } catch (err) {
      logger.error({ err, topicUrl: topic.url }, "[news] ingestion error for topic");
    }
  }

  return { ingested: count, categoriesProcessed: Array.from(processedCats), capped: false };
}
