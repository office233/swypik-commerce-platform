import { NextRequest, NextResponse } from "next/server";
import { runNewsIngestionPipeline } from "@/lib/news/rss-ingester";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isEnabled("news")) return frozenResponse("news");

  try {
    let targetCategory: string | undefined;

    const urlCat = req.nextUrl.searchParams.get("category");
    if (urlCat) {
      targetCategory = urlCat;
    } else {
      try {
        const body = await req.json().catch(() => ({}));
        if (body?.category) targetCategory = String(body.category);
      } catch {
        // query param fallback
      }
    }

    const res = await runNewsIngestionPipeline(targetCategory);
    return NextResponse.json({
      ok: true,
      message: `Pipeline executat cu succes. ${res.ingested} articole noi generate de AI pentru categoriile: ${res.categoriesProcessed.join(", ") || targetCategory || "toate"}.`,
      ingested: res.ingested,
      categories: res.categoriesProcessed,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
