import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const { rows: campaigns } = await dbQuery(
      `SELECT
         a.id,
         a.campaign_name,
         a.ad_type,
         a.product_id,
         p.title as product_title,
         a.daily_budget_cents,
         a.spent_budget_cents,
         a.target_city,
         a.status,
         a.impressions_count,
         a.clicks_count,
         a.orders_count,
         a.revenue_cents,
         a.created_at
       FROM seller_ads a
       LEFT JOIN marketplace_products p ON a.product_id = p.id
       WHERE a.seller_id = $1
       ORDER BY a.created_at DESC`,
      [sellerId]
    );

    // Summary metrics
    const summary = campaigns.reduce(
      (acc, c) => {
        acc.totalSpentCents += Number(c.spent_budget_cents) || 0;
        acc.totalRevenueCents += Number(c.revenue_cents) || 0;
        acc.totalImpressions += Number(c.impressions_count) || 0;
        acc.totalClicks += Number(c.clicks_count) || 0;
        acc.totalOrders += Number(c.orders_count) || 0;
        return acc;
      },
      {
        totalSpentCents: 0,
        totalRevenueCents: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalOrders: 0,
      }
    );

    const roas = summary.totalSpentCents > 0
      ? (summary.totalRevenueCents / summary.totalSpentCents).toFixed(2)
      : "0.00";

    return NextResponse.json({
      success: true,
      campaigns,
      summary: {
        ...summary,
        roas,
      },
    });
  } catch (error: any) {
    console.error("[Seller Ads GET] Error:", error);
    return NextResponse.json({ success: false, error: "Eroare la preluarea campaniilor." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const body = await req.json();
    const {
      campaignName,
      adType = "boost_reel",
      productId,
      dailyBudgetRon = 20,
      targetCity = "all_ro",
    } = body;

    if (!campaignName?.trim()) {
      return NextResponse.json({ success: false, error: "Numele campaniei este obligatoriu." }, { status: 400 });
    }

    const dailyBudgetCents = Math.round(Math.max(10, Number(dailyBudgetRon) || 20) * 100);

    const { rows } = await dbQuery(
      `INSERT INTO seller_ads (
         seller_id, campaign_name, ad_type, product_id,
         daily_budget_cents, spent_budget_cents, target_city,
         status, impressions_count, clicks_count, orders_count, revenue_cents
       ) VALUES (
         $1, $2, $3, $4,
         $5, 0, $6,
         'active', 0, 0, 0, 0
       ) RETURNING id, campaign_name, ad_type, daily_budget_cents, status, created_at`,
      [
        sellerId,
        campaignName.trim(),
        adType,
        productId || null,
        dailyBudgetCents,
        targetCity,
      ]
    );

    return NextResponse.json({
      success: true,
      campaign: rows[0],
      message: "Campania publicitară Swypik Ads a fost lansată cu succes!",
    });
  } catch (error: any) {
    console.error("[Seller Ads POST] Error:", error);
    return NextResponse.json({ success: false, error: "Eroare la crearea campaniei." }, { status: 500 });
  }
}
