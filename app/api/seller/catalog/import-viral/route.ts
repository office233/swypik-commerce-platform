import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import { getSellerSessionId } from "@/lib/security/seller-auth";
import { VIRAL_PRODUCTS } from "../viral-products/route";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(req: Request) {
  try {
    const sellerId = await getSellerSessionId();
    if (!sellerId) {
      return NextResponse.json({ success: false, error: "Neautorizat." }, { status: 401 });
    }

    const body = await req.json();
    const { viralId, customPriceRon } = body;

    const viralProduct = VIRAL_PRODUCTS.find((p) => p.id === viralId);
    if (!viralProduct) {
      return NextResponse.json({ success: false, error: "Produsul viral nu a fost găsit." }, { status: 404 });
    }

    // Get seller user_id
    const { rows: sRows } = await dbQuery<{ user_id: string | null }>(
      "SELECT user_id FROM sellers WHERE id = $1",
      [sellerId]
    );
    const sellerUserId = sRows[0]?.user_id;

    const retailPriceRon = customPriceRon ? Number(customPriceRon) : viralProduct.recommendedPriceRon;
    const priceCents = Math.round(retailPriceRon * 100);
    const supplierCostCents = Math.round(viralProduct.wholesaleCostRon * 100);
    const slug = `${slugify(viralProduct.title)}-${Date.now().toString(36)}`;

    const meta = {
      seller_id: sellerId,
      available_stock: 100, // On-demand supplier stock
      is_ondemand_fulfillment: true,
      supplier_note: "Depozit Partener România — Livrare în 24-48h",
      sku: viralProduct.sku,
      barcode: viralProduct.barcode,
      video_url: viralProduct.videoUrl,
      image_urls: [viralProduct.imageUrl],
      is_swypik_listed: true,
      swypik_price: retailPriceRon,
    };

    // Insert into marketplace_products
    const { rows: pRows } = await dbQuery<{ id: string }>(
      `INSERT INTO marketplace_products (
        source_type, seller_id, title, slug, description,
        price_cents, supplier_cost_cents, category, currency,
        status, inventory_status, image_url, metadata
      ) VALUES (
        'seller', $1, $2, $3, $4,
        $5, $6, $7, 'RON',
        'active', 'in_stock', $8, $9::jsonb
      ) RETURNING id`,
      [
        sellerId,
        viralProduct.title,
        slug,
        viralProduct.description,
        priceCents,
        supplierCostCents,
        viralProduct.category,
        viralProduct.imageUrl,
        JSON.stringify(meta),
      ]
    );

    const productId = pRows[0]?.id;

    // Link video and creator product links
    if (productId && sellerUserId && viralProduct.videoUrl) {
      const { rows: vRows } = await dbQuery<{ id: string }>(
        `INSERT INTO videos (
           creator_id, playback_url, thumbnail_url, title, description,
           status, visibility, effective_label
         ) VALUES ($1, $2, $3, $4, $5, 'ready', 'public', 'safe')
         RETURNING id`,
        [sellerUserId, viralProduct.videoUrl, viralProduct.imageUrl, viralProduct.title, viralProduct.description]
      );
      const videoId = vRows[0]?.id;
      if (videoId) {
        await dbQuery(
          `INSERT INTO video_product_links (video_id, product_id, placement, sort_order, metadata)
           VALUES ($1, $2, 'card', 0, '{}'::jsonb)`,
          [videoId, productId]
        );
        await dbQuery(
          `INSERT INTO creator_product_links (creator_id, product_id, status)
           VALUES ($1, $2, 'active')`,
          [sellerUserId, productId]
        );
      }
    }

    return NextResponse.json({
      success: true,
      productId,
      message: `Produsul "${viralProduct.title}" a fost adăugat în magazinul tău cu video și poze!`,
    });
  } catch (error: any) {
    console.error("[Import Viral API] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Eroare la importul produsului." }, { status: 500 });
  }
}
