import { Suspense } from "react";
import AdsClient from "./AdsClient";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";

export const dynamic = "force-dynamic";

export default async function SellerAdsPage() {
  const sellerId = await getSellerSessionId();

  let initialCampaigns: any[] = [];
  let sellerProducts: any[] = [];

  if (sellerId) {
    try {
      const { rows } = await dbQuery(
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
      initialCampaigns = rows;

      const { rows: prods } = await dbQuery(
        `SELECT id, title, price_cents
         FROM marketplace_products
         WHERE seller_id = $1 AND inventory_status != 'archived'
         LIMIT 50`,
        [sellerId]
      );
      sellerProducts = prods;
    } catch (e) {
      console.error("Error loading seller ads:", e);
    }
  }

  return (
    <Suspense fallback={<div className="p-8 text-neutral-500 font-bold">Se încarcă Swypik Ads...</div>}>
      <AdsClient initialCampaigns={initialCampaigns} sellerProducts={sellerProducts} />
    </Suspense>
  );
}
