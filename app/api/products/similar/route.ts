import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { embed, toPgVector } from "@/lib/ai/embeddings";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  title: string;
  price_cents: number | null;
  image_url: string | null;
  distance: number;
};

const HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("product_id");
  const text = url.searchParams.get("text");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1), 50);

  if (!productId && !text) {
    return NextResponse.json({ error: "product_id or text required" }, { status: 400 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (productId && !UUID_RE.test(productId)) {
    return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });
  }
  if (text && (text.length < 2 || text.length > 200)) {
    return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  }

  let pgVec: string | null = null;
  let excludeId: string | null = null;

  try {
    if (productId) {
      excludeId = productId;
      const res = await dbQuery<{ embedding: string | null }>(
        `SELECT embedding::text AS embedding FROM marketplace_products WHERE id = $1 LIMIT 1`,
        [productId]
      );
      const row = res.rows[0];
      if (!row || !row.embedding) {
        // niciun embedding pt produs (pgvector neactivat sau cron încă nu a procesat)
        return NextResponse.json({ products: [], reason: "no-embedding" }, { headers: HEADERS });
      }
      pgVec = row.embedding;
    } else if (text) {
      const vec = await embed(text);
      pgVec = toPgVector(vec);
    }

    if (!pgVec) {
      return NextResponse.json({ products: [] }, { headers: HEADERS });
    }

    const params: any[] = [pgVec, limit];
    let where = `embedding IS NOT NULL`;
    if (excludeId) {
      params.push(excludeId);
      where += ` AND id <> $${params.length}`;
    }

    const res = await dbQuery<ProductRow>(
      `SELECT id, title, price_cents, image_url,
              (embedding <=> $1::vector) AS distance
         FROM marketplace_products
        WHERE ${where}
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      params
    );

    const products = res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      price: (r.price_cents || 0) / 100,
      image: r.image_url,
      rating: null,
      ratingCount: 0,
      similarity: 1 - Number(r.distance),
    }));

    return NextResponse.json({ products }, { headers: HEADERS });
  } catch (e: any) {
    // probabil pgvector neactivat sau coloana embedding lipsește
    return NextResponse.json(
      { products: [], reason: "unavailable", error: String(e?.message || e).slice(0, 200) },
      { headers: HEADERS, status: 200 }
    );
  }
}
