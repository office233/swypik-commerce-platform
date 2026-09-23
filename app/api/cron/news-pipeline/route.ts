import { NextRequest, NextResponse } from "next/server";
import { runNewsIngestionPipeline } from "@/lib/news/rss-ingester";
import { isEnabled, frozenResponse } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isEnabled("news")) return frozenResponse("news");

  try {
    const res = await runNewsIngestionPipeline();
    return NextResponse.json({
      ok: true,
      message: `Pipeline executat cu succes. ${res.ingested} articole noi generate de AI.`,
      ingested: res.ingested,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
