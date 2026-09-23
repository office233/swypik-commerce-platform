import { dbQuery } from "@/lib/db";
import { generateAutonomousNewsArticle } from "./ai-journalist";

export interface FeedTopic {
  title: string;
  source: string;
  summary: string;
  url: string;
}

// Surse sigure demonstrative pentru inițializarea feed-ului
const SAMPLE_FEEDS: FeedTopic[] = [
  {
    title: "Revoluție în AI: Noile modele multimodale procesează video în timp real cu latență zero",
    source: "TechCrunch",
    summary: "Cercetătorii au anunțat o arhitectură revoluționară de rețele neuronale capabilă să proceseze stream-uri video HD la 60 FPS direct pe dispozitive mobile.",
    url: "https://techcrunch.com/ai-realtime-breakthrough",
  },
  {
    title: "Bitcoin atinge noi maxime istorice susținut de fluxurile record din ETF-urile instituționale",
    source: "CoinDesk",
    summary: "Piața crypto înregistrează o creștere spectaculoasă, volumul tranzacțiilor spot depășind mediile anuale datorită adoptării masive de către marile fonduri.",
    url: "https://coindesk.com/btc-etf-all-time-highs",
  },
  {
    title: "Next-Gen Gaming: Motoarele grafice WebGL 3D permit jocuri AAA direct în browser",
    source: "IGN",
    summary: "Dezvoltatorii de jocuri migrează către soluții WebAssembly și WebGPU, oferind grafică fotorealistă pe mobil fără timpi de descărcare.",
    url: "https://ign.com/next-gen-webgpu-gaming",
  },
];

export async function runNewsIngestionPipeline(): Promise<{ ingested: number }> {
  let count = 0;

  for (const topic of SAMPLE_FEEDS) {
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
      const generated = await generateAutonomousNewsArticle(topic);

      // 4. Obținem category_id
      const catRes = await dbQuery<{ id: string }>(
        `SELECT id FROM news_categories WHERE slug = $1 LIMIT 1`,
        [generated.category_slug]
      );
      const categoryId = catRes.rows[0]?.id;
      if (!categoryId) continue;

      // Imagine de acoperire relevantă
      const coverImages = [
        "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80",
      ];
      const coverUrl = coverImages[count % coverImages.length];

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

      count++;
    } catch (err) {
      console.error("[News Ingest Error]", err);
    }
  }

  return { ingested: count };
}
