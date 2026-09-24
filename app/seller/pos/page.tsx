import { dbQuery } from "@/lib/db";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import PosClient, { PosProduct } from "./PosClient";

export const dynamic = "force-dynamic";

export default async function SellerPosPage() {
  const t = await getTranslations("sellerPos");
  const sellerId = await getSellerSessionId();
  if (!sellerId) {
    redirect("/seller/login");
  }

  // Load seller products with their current stock and prices
  const { rows } = await dbQuery<{
    id: string;
    title: string;
    price_cents: number;
    category: string | null;
    image_url: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `SELECT
       id,
       title,
       price_cents,
       category,
       image_url,
       metadata
     FROM marketplace_products
     WHERE seller_id = $1 AND status != 'archived'
     ORDER BY title ASC`,
    [sellerId]
  );

  const initialProducts: PosProduct[] = rows.map((r) => {
    const meta = (r.metadata || {}) as { available_stock?: unknown; stock?: unknown; sku?: unknown };
    const stock = Number(meta.available_stock ?? (meta.stock ?? 10));
    return {
      id: r.id,
      title: r.title,
      priceCents: r.price_cents,
      stock: Number.isFinite(stock) ? stock : 0,
      imageUrl: r.image_url,
      sku: (typeof meta.sku === "string" ? meta.sku : null),
      category: r.category,
    };
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-[#0D0D0D]">{t("title")}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <PosClient initialProducts={initialProducts} />
    </div>
  );
}
