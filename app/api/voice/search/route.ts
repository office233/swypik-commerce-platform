import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { embed, toPgVector } from "@/lib/ai/embeddings";
import { transcribe } from "@/lib/ai/transcribe";
import { rateLimit } from "@/lib/security/rate-limit";
import { getAuthSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ProductRow = {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  price_cents: number | null;
  currency: string;
  distance: number;
};

export async function POST(req: Request) {
  const session = await getAuthSession();
  const key = session?.userId || (req.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
  const rl = await rateLimit("voice-search", key, { limit: 10, window: 60 });
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio required (multipart 'audio')" }, { status: 400 });
  }
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "audio too large (max 25MB)" }, { status: 413 });
  }

  const buf = Buffer.from(await audio.arrayBuffer());
  const lang = typeof form?.get("lang") === "string" ? String(form.get("lang")) : "ro";
  const stt = await transcribe(buf, lang, "voice.webm");
  const transcript = stt.text.trim();
  if (!transcript) {
    return NextResponse.json({ transcript: "", products: [], note: "transcription unavailable" }, { status: 200 });
  }

  let products: ProductRow[] = [];
  try {
    const vec = await embed(transcript);
    const lit = toPgVector(vec);
    const { rows } = await dbQuery<ProductRow>(
      `SELECT id, slug, title, image_url, price_cents, currency,
              (embedding <=> $1::vector) AS distance
         FROM marketplace_products
        WHERE embedding IS NOT NULL AND status = 'active'
        ORDER BY embedding <=> $1::vector
        LIMIT 20`,
      [lit],
    );
    products = rows;
  } catch (e) {
    console.warn("[voice-search] embed/search failed:", (e as Error).message);
  }

  return NextResponse.json({ transcript, products });
}
