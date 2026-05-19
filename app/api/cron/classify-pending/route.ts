import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { dbQuery } from "@/lib/db";
import { labelProduct } from "@/lib/moderation/labelProduct";
import { runCron } from "@/lib/cron/runCron";

export const dynamic = "force-dynamic";

const BATCH = 200;

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

type Row = {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  canonical_category: string | null;
};

export async function POST(req: Request): Promise<Response> {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runCron("classify-pending", async () => {
    const { rows } = await dbQuery<Row>(
      `
      SELECT mp.id, mp.title, mp.description, mp.category, mp.canonical_category
        FROM marketplace_products mp
        JOIN product_safety_labels psl ON psl.product_id = mp.id
       WHERE psl.classifier_version = 'auto_pending'
          OR (psl.classifier_version IS DISTINCT FROM 'v2'
              AND psl.reviewed_by_human = FALSE)
       ORDER BY psl.classified_at NULLS FIRST
       LIMIT $1
      `,
      [BATCH],
    );

    let done = 0;
    let errors = 0;
    for (const r of rows) {
      try {
        await labelProduct(r);
        done++;
      } catch {
        errors++;
      }
    }
    return { picked: rows.length, done, errors };
  });
  return NextResponse.json(result);
}

export async function GET(req: Request): Promise<Response> {
  return POST(req);
}
