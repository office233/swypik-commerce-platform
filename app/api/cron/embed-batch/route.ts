import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { dbQuery } from "@/lib/db";
import { embed, toPgVector, EmbeddingError } from "@/lib/ai/embeddings";
import { runCron } from "@/lib/cron/runCron";

export const dynamic = "force-dynamic";

const BATCH = Number(process.env.EMBED_BATCH_SIZE || 100);

async function authorize(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("cron-secret") ||
    "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !token) return false;
  if (Buffer.byteLength(token) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

type Row = { id: string; title: string | null; description: string | null };

async function processProducts(): Promise<{ done: number; errors: number; lastError: string | null }> {
  let done = 0;
  let errors = 0;
  let lastError: string | null = null;
  let rows: Row[] = [];
  try {
    const res = await dbQuery<Row>(
      `SELECT id, title, description
         FROM marketplace_products
        WHERE embedding IS NULL
           OR embedding_updated_at IS NULL
           OR embedding_updated_at < updated_at
        ORDER BY (embedding IS NULL) DESC, updated_at DESC NULLS LAST
        LIMIT $1`,
      [BATCH]
    );
    rows = res.rows;
  } catch (e: any) {
    // probably column doesn't exist yet (migration 0024 not applied → pgvector missing)
    return { done: 0, errors: 0, lastError: ((e as Error)?.message || "").slice(0, 200) || null };
  }
  for (const r of rows) {
    const text = `${r.title || ""}. ${r.description || ""}`.trim();
    if (!text) continue;
    try {
      const vec = await embed(text);
      await dbQuery(
        `UPDATE marketplace_products
            SET embedding = $1::vector, embedding_updated_at = NOW()
          WHERE id = $2`,
        [toPgVector(vec), r.id]
      );
      done += 1;
    } catch (e) {
      errors += 1;
      lastError = (e as Error)?.message?.slice(0, 200) || String(e);
      if (e instanceof EmbeddingError && (e.status === 401 || e.status === 403)) break;
    }
  }
  return { done, errors, lastError };
}

async function processVideos(): Promise<{ done: number; errors: number; lastError: string | null }> {
  let done = 0;
  let errors = 0;
  let lastError: string | null = null;
  let rows: Row[] = [];
  try {
    const res = await dbQuery<Row>(
      `SELECT id, title, description
         FROM videos
        WHERE (embedding IS NULL
           OR embedding_updated_at IS NULL
           OR embedding_updated_at < updated_at)
          AND COALESCE(is_hidden, false) = false
        ORDER BY (embedding IS NULL) DESC, updated_at DESC NULLS LAST
        LIMIT $1`,
      [BATCH]
    );
    rows = res.rows;
  } catch (e: any) {
    return { done: 0, errors: 0, lastError: ((e as Error)?.message || "").slice(0, 200) || null };
  }
  for (const r of rows) {
    const text = `${r.title || ""}. ${r.description || ""}`.trim();
    if (!text) continue;
    try {
      const vec = await embed(text);
      await dbQuery(
        `UPDATE videos
            SET embedding = $1::vector, embedding_updated_at = NOW()
          WHERE id = $2`,
        [toPgVector(vec), r.id]
      );
      done += 1;
    } catch (e) {
      errors += 1;
      lastError = (e as Error)?.message?.slice(0, 200) || String(e);
      if (e instanceof EmbeddingError && (e.status === 401 || e.status === 403)) break;
    }
  }
  return { done, errors, lastError };
}

async function handlePOST(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const products = await processProducts();
  const videos = await processVideos();
  return NextResponse.json({
    ok: true,
    products: products.done,
    videos: videos.done,
    errors: products.errors + videos.errors,
    lastError: products.lastError || videos.lastError || null,
  });
}

async function handleGET(req: Request) {
  return POST(req);
}

export async function GET(req: Request) { return runCron("embed-batch", () => handleGET(req as any)); }

export async function POST(req: Request) { return runCron("embed-batch", () => handlePOST(req as any)); }
