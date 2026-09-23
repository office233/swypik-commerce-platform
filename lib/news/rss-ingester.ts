import { dbQuery } from "@/lib/db";
import { generateAutonomousNewsArticle } from "./ai-journalist";

export interface FeedTopic {
  title: string;
  source: string;
  summary: string;
  url: string;
  category: "tech-ai" | "crypto" | "gaming" | "business" | "science";
}

// Feeds pe multiple categorii
const MULTI_CATEGORY_FEEDS: FeedTopic[] = [
  // 1. Tech & AI
  {
    title: "Revoluție în AI: Noile modele multimodale procesează video în timp real cu latență zero",
    source: "TechCrunch",
    summary: "Cercetătorii au anunțat o arhitectură revoluționară de rețele neuronale capabilă să proceseze stream-uri video HD la 60 FPS direct pe dispozitive mobile.",
    url: "https://techcrunch.com/ai-realtime-breakthrough",
    category: "tech-ai",
  },
  {
    title: "Open Source AI depășește modelele proprietare pe benchmark-urile de programare",
    source: "Hacker News",
    summary: "Comunitatea open source a lansat o nouă familie de modele optimizate pentru dezvoltare software care rulează eficient pe hardware accesibil.",
    url: "https://news.ycombinator.com/item?id=ai-open-source-evals",
    category: "tech-ai",
  },
  // 2. Crypto & Web3
  {
    title: "Bitcoin atinge noi maxime istorice susținut de fluxurile record din ETF-urile instituționale",
    source: "CoinDesk",
    summary: "Piața crypto înregistrează o creștere spectaculoasă, volumul tranzacțiilor spot depășind mediile anuale datorită adoptării masive de către marile fonduri.",
    url: "https://coindesk.com/btc-etf-all-time-highs",
    category: "crypto",
  },
  {
    title: "Ethereum L2 și Arbitrum depășesc volumul de tranzacții din rețelele bancare tradiționale",
    source: "CoinTelegraph",
    summary: "Soluțiile Layer 2 reduc comisioanele la sub 1 cent, declanșând un val masiv de micropăți și tranzacții DeFi la scară globală.",
    url: "https://cointelegraph.com/news/ethereum-l2-volume-record",
    category: "crypto",
  },
  // 3. Gaming
  {
    title: "Next-Gen Gaming: Motoarele grafice WebGL 3D permit jocuri AAA direct în browser",
    source: "IGN",
    summary: "Dezvoltatorii de jocuri migrează către soluții WebAssembly și WebGPU, oferind grafică fotorealistă pe mobil fără timpi de descărcare.",
    url: "https://ign.com/next-gen-webgpu-gaming",
    category: "gaming",
  },
  {
    title: "Unreal Engine 5.6 aduce randare neurală în timp real pentru console și PC",
    source: "PC Gamer",
    summary: "Epic Games a dezvăluit instrumente avansate de generare procedurală ce scurtează ciclurile de producție pentru titlurile de calibru mare.",
    url: "https://pcgamer.com/unreal-engine-neural-update",
    category: "gaming",
  },
  // 4. Business & Startups
  {
    title: "Finanțările pentru startup-urile de comerț social explodează în Europa Centrală",
    source: "Forbes Business",
    summary: "Investitorii de capital de risc pariază masiv pe platformele de shopping nativ video și marketplace-uri descentralizate.",
    url: "https://forbes.com/business-social-commerce-boom",
    category: "business",
  },
  {
    title: "Gigantii din retail adoptă blockchain pentru trasabilitatea lanțului de aprovizionare",
    source: "Bloomberg",
    summary: "Transparența sporită și reducerea fraudelor determină companiile din Fortune 500 să integreze registre distribuite pentru mărfuri de valoare ridicată.",
    url: "https://bloomberg.com/news/supply-chain-blockchain-adoption",
    category: "business",
  },
  // 5. Știință & Spațiu
  {
    title: "Telescopul James Webb descoperă molecule organice complexe în atmosferele exoplanetelor",
    source: "ScienceDaily",
    summary: "Observațiile spectrometrice confirmă prezența compușilor pe bază de carbon într-o zonă locuibilă a unui sistem solar vecin.",
    url: "https://sciencedaily.com/jwst-organic-molecules-exoplanet",
    category: "science",
  },
  {
    title: "Fuziunea nucleară atinge un nou record de randament net de energie în testele de laborator",
    source: "Nature",
    summary: "Fizicienii au menținut o reacție de fuziune stabilă cu un surplus de energie de peste 50%, deschizând drumul spre centrale energetice curate.",
    url: "https://nature.com/articles/fusion-energy-breakthrough",
    category: "science",
  },
];

// Imagini Unsplash de înaltă rezoluție pe categorii
const CATEGORY_COVERS: Record<string, string[]> = {
  "tech-ai": [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80",
  ],
  "crypto": [
    "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=1200&auto=format&fit=crop&q=80",
  ],
  "gaming": [
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&auto=format&fit=crop&q=80",
  ],
  "business": [
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&auto=format&fit=crop&q=80",
  ],
  "science": [
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=1200&auto=format&fit=crop&q=80",
  ],
};

export async function runNewsIngestionPipeline(targetCategory?: string): Promise<{ ingested: number; categoriesProcessed: string[] }> {
  let count = 0;
  const processedCats = new Set<string>();

  // Filtrare pe categorie dacă este specificată, altfel procesăm toate
  const topicsToProcess = targetCategory && targetCategory !== "all"
    ? MULTI_CATEGORY_FEEDS.filter((t) => t.category === targetCategory)
    : MULTI_CATEGORY_FEEDS;

  for (const topic of topicsToProcess) {
    try {
      // 1. Verificăm dacă articolul există deja după URL
      const checkRes = await dbQuery(
        `SELECT id FROM news_raw_items WHERE url = $1 LIMIT 1`,
        [topic.url]
      );
      if (checkRes.rows.length > 0) continue;

      // 2. Înregistrăm în news_raw_items
      await dbQuery(
        `INSERT INTO news_raw_items (url, title, raw_content, author, published_at, is_processed)
         VALUES ($1, $2, $3, $4, now(), true)`,
        [topic.url, topic.title, topic.summary, topic.source]
      );

      // 3. AI scrie articolul autonom
      const generated = await generateAutonomousNewsArticle({
        ...topic,
        categoryHint: topic.category,
      });

      // 4. Obținem category_id
      const finalCategorySlug = generated.category_slug || topic.category;
      const catRes = await dbQuery<{ id: string }>(
        `SELECT id FROM news_categories WHERE slug = $1 LIMIT 1`,
        [finalCategorySlug]
      );
      const categoryId = catRes.rows[0]?.id;
      if (!categoryId) continue;

      // Imagine de acoperire relevantă pentru categorie
      const covers = CATEGORY_COVERS[finalCategorySlug] || CATEGORY_COVERS["tech-ai"];
      const coverUrl = covers[count % covers.length];

      // 5. Salvăm articolul final în news_articles
      const inserted = await dbQuery<{ id: string }>(
        `INSERT INTO news_articles (
          slug, category_id, title, summary_tldr, content_markdown,
          cover_image_url, is_breaking, reading_time_minutes, fact_check_score,
          fact_check_notes, status, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'published', now())
        ON CONFLICT (slug) DO UPDATE SET updated_at = now()
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

      // 6. Salvăm sursa originală
      if (inserted.rows[0]?.id) {
        await dbQuery(
          `INSERT INTO news_article_sources (article_id, original_url, original_title)
           VALUES ($1, $2, $3)`,
          [inserted.rows[0].id, topic.url, topic.title]
        );
      }

      processedCats.add(finalCategorySlug);
      count++;
    } catch (err) {
      console.error("[News Ingest Error]", err);
    }
  }

  return { ingested: count, categoriesProcessed: Array.from(processedCats) };
}
