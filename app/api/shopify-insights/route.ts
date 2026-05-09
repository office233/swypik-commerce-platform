import { NextResponse } from "next/server";
import { getCommerceInsights } from "@/lib/shopify/commerce-insights";

export async function GET(req: Request) {
  // Block in production unless admin secret is provided
  const adminSecret = req.headers.get("x-admin-secret");
  if (process.env.NODE_ENV === "production" && adminSecret !== process.env.ADMIN_DEBUG_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const insights = await getCommerceInsights();

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      totals: insights.totals,
      topSoldProducts: insights.topSoldProducts,
      topRevenueProducts: insights.topRevenueProducts,
      topAbandonedProducts: insights.topAbandonedProducts,
      highIntentProducts: insights.highIntentProducts,
      productsToPush: insights.productsToPush,
      bestBundles: insights.bestBundles,
    });
  } catch (error: any) {
    console.error("[Shopify Insights]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Insights unavailable.",
      },
      { status: 500 }
    );
  }
}
