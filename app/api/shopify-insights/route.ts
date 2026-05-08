import { NextResponse } from "next/server";
import { getCommerceInsights } from "@/lib/shopify/commerce-insights";

export async function GET() {
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
    console.error("[Shopify Insights]", error.message);

    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
