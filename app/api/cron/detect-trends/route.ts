import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { fetchCopilot, getCopilotGhuTokens } from "@/lib/ai/github-models-tokens";
import { dbQuery } from "@/lib/db";
import { runCron } from "@/lib/cron/runCron";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorize(req: Request): boolean {
  // Acceptă și x-cron-secret (standardul celorlalte joburi), și Bearer.
  const token =
    (req.headers.get("authorization") || "").replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

type Trend = { name: string; score: number; type: "hashtag" | "audio" | "product" | "topic"; metadata?: any };

async function topHashtags(): Promise<Trend[]> {
  const sql = `
    WITH recent AS (
      SELECT unnest(tags) AS tag FROM videos
       WHERE published_at >= now() - interval '30 days'
         AND visibility='public' AND is_hidden=false
         AND status='ready' AND effective_label='safe'
    ),
    prior AS (
      SELECT unnest(tags) AS tag FROM videos
       WHERE published_at >= now() - interval '90 days'
         AND published_at < now() - interval '30 days'
         AND visibility='public' AND is_hidden=false
         AND status='ready' AND effective_label='safe'
    ),
    r AS (SELECT tag, COUNT(*)::int c FROM recent GROUP BY tag),
    p AS (SELECT tag, COUNT(*)::int c FROM prior GROUP BY tag)
    SELECT r.tag, r.c AS recent_count, COALESCE(p.c,0) AS prior_count,
           CASE WHEN COALESCE(p.c,0)=0 THEN r.c::numeric*10 ELSE (r.c::numeric*7 / NULLIF(p.c,0)) END AS growth
      FROM r LEFT JOIN p USING (tag)
     WHERE r.c >= 1
     ORDER BY growth DESC NULLS LAST
     LIMIT 20`;
  const { rows } = await dbQuery<{ tag: string; recent_count: number; prior_count: number; growth: number }>(sql);
  return rows.map((r) => ({
    name: r.tag,
    score: Number(r.growth) || 0,
    type: "hashtag" as const,
    metadata: { recent_count: r.recent_count, prior_count: r.prior_count },
  }));
}

async function topAudios(): Promise<Trend[]> {
  const sql = `
    SELECT v.audio_track_id, at.title, at.artist, COUNT(*)::int c
      FROM videos v
      JOIN audio_tracks at ON at.id = v.audio_track_id
     WHERE v.published_at >= now() - interval '30 days'
       AND v.audio_track_id IS NOT NULL
       AND v.visibility='public' AND v.is_hidden=false
      AND v.status='ready' AND v.effective_label='safe'
     GROUP BY v.audio_track_id, at.title, at.artist
     ORDER BY c DESC
     LIMIT 10`;
  try {
    const { rows } = await dbQuery<{ audio_track_id: string; title: string; artist: string; c: number }>(sql);
    return rows.map((r) => ({
      name: `${r.title} – ${r.artist}`,
      score: r.c,
      type: "audio" as const,
      metadata: { audio_track_id: r.audio_track_id, count: r.c },
    }));
  } catch {
    return [];
  }
}

async function topProducts(): Promise<Trend[]> {
  const sql = `
    WITH recent AS (
      SELECT (metadata->>'product_id')::text AS pid, COUNT(*)::int c
        FROM feed_events
       WHERE event_type IN ('purchase_click','product_view')
         AND occurred_at >= now() - interval '30 days'
         AND metadata ? 'product_id'
       GROUP BY pid
    )
    SELECT r.pid, p.title, r.c
      FROM recent r
      JOIN marketplace_products p ON p.id::text = r.pid
     WHERE p.status='active'
     ORDER BY r.c DESC
     LIMIT 10`;
  try {
    const { rows } = await dbQuery<{ pid: string; title: string; c: number }>(sql);
    return rows.map((r) => ({
      name: r.title,
      score: r.c,
      type: "product" as const,
      metadata: { product_id: r.pid, count: r.c },
    }));
  } catch {
    return [];
  }
}

async function aiSynthesize(input: { hashtags: Trend[]; audios: Trend[]; products: Trend[] }): Promise<Trend[]> {
  if (getCopilotGhuTokens().length === 0) return [];
  try {
    const model = (process.env.TRANSLATE_MODEL || "gpt-4o-mini").replace(/^openai\//, "");
    const { res } = await fetchCopilot("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: 'You analyze marketplace metrics and surface emerging shopping/cultural topics. Return STRICT JSON {"trends":[{"name":string,"score":number,"type":"topic"}...]} max 5 entries.',
          },
          {
            role: "user",
            content: JSON.stringify({
              top_hashtags: input.hashtags.slice(0, 10).map((t) => ({ name: t.name, growth: t.score })),
              top_audios: input.audios.slice(0, 5).map((t) => ({ name: t.name, count: t.score })),
              top_products: input.products.slice(0, 5).map((t) => ({ name: t.name, count: t.score })),
            }),
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
        max_tokens: 400,
      }),
    });
    if (!res.ok) {
      console.warn("[detect-trends] ai synth http", res.status);
      return [];
    }
    const json: any = await res.json();
    const raw = json?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed?.trends) ? parsed.trends : [];
    return arr.slice(0, 5).map((t: any) => ({
      name: String(t.name || ""),
      score: Number(t.score) || 0,
      type: "topic" as const,
    })).filter((t: Trend) => t.name);
  } catch (e) {
    console.warn("[detect-trends] ai synth failed:", (e as Error).message);
    return [];
  }
}

async function run(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [hashtags, audios, products] = await Promise.all([topHashtags(), topAudios(), topProducts()]);
  const topics = await aiSynthesize({ hashtags, audios, products });
  const all: Trend[] = [...hashtags, ...audios, ...products, ...topics];

  let inserted = 0;
  for (const t of all) {
    try {
      await dbQuery(
        `INSERT INTO trending_now(type, name, score, metadata) VALUES ($1,$2,$3,$4)`,
        [t.type, t.name, t.score, JSON.stringify(t.metadata || {})],
      );
      inserted++;
    } catch (e) {
      console.warn("[detect-trends] insert fail:", (e as Error).message);
    }
  }
  await dbQuery(`DELETE FROM trending_now WHERE detected_at < now() - interval '7 days'`).catch(() => {});
  return NextResponse.json({
    ok: true,
    inserted,
    counts: { hashtags: hashtags.length, audios: audios.length, products: products.length, topics: topics.length },
  });
}

export async function POST(req: Request) { return runCron("detect-trends", () => run(req)); }
export async function GET(req: Request) { return runCron("detect-trends", () => run(req)); }
