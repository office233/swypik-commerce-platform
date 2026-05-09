/**
 * API endpoint for Chrome Extension v6 — receives scraped product data
 * No AliExpress API needed! Data comes directly from DOM scraping.
 */
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const IMPORT_SECRET = process.env.IMPORT_SECRET || "aicevrei-import-2026";

function calculatePriceRON(costUsd: number, shipUsd: number) {
  const totalRon = (costUsd + shipUsd) * 4.55 * 1.21;
  const mk = costUsd < 3 ? 2.0 : costUsd < 50 ? 1.5 : 1.3;
  const raw = totalRon * mk;
  const pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399,449,499,599,699,799,899,999];
  const price = pts.find(p => p >= raw) || Math.ceil(raw / 100) * 100 - 1;
  const oldMul = 1.6 + (Math.abs(Math.round(costUsd * 100)) % 30) / 100;
  const oldPrice = pts.find(p => p >= price * oldMul) || Math.ceil(price * oldMul / 10) * 10 - 1;
  return { price, oldPrice, markup: mk };
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-import-secret");
    if (secret !== IMPORT_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const products = Array.isArray(body) ? body : [body];
    let imported = 0, skipped = 0, failed = 0;

    for (const p of products) {
      try {
        if (!p.productId) { failed++; continue; }

        // Check if exists
        const existing = await sql`SELECT id FROM ae_products WHERE ae_product_id = ${p.productId}`;
        if (existing.length > 0) { skipped++; continue; }

        const costUsd = parseFloat(p.price) || 0;
        const shipUsd = parseFloat(p.shippingPrice) || 0;
        if (costUsd <= 0) { failed++; continue; }

        const { price, oldPrice, markup } = calculatePriceRON(costUsd, shipUsd);
        const images = (p.images || []).slice(0, 6);
        const colors = [...new Set((p.variants || []).filter((v: any) => v.color).map((v: any) => v.color))];
        const sizes = [...new Set((p.variants || []).filter((v: any) => v.size).map((v: any) => v.size))];

        await sql`INSERT INTO ae_products (
          ae_product_id, category_id, title, description, min_price_usd, max_price_usd,
          price_ron, old_price_ron, markup, main_image, images, video_url, has_video,
          rating, rating_count, orders_count, product_status, brand, properties,
          ship_method, ship_cost_usd, ship_free, ship_days_min, ship_days_max,
          store_id, store_name, store_rating, variants_count, source_url,
          color, colors, sizes, material, style, gender
        ) VALUES (
          ${p.productId}, ${p.categoryId || 0}, ${p.title || ''}, ${p.description || ''},
          ${costUsd}, ${p.maxPrice || costUsd}, ${price}, ${oldPrice}, ${markup},
          ${images[0] || ''}, ${JSON.stringify(images)}, ${p.videoUrl || null}, ${!!p.videoUrl},
          ${p.rating || 0}, ${p.ratingCount || 0}, ${p.orders || 0}, 'onSelling',
          ${p.brand || null}, ${JSON.stringify(p.properties || [])},
          ${p.shippingMethod || ''}, ${shipUsd}, ${shipUsd === 0}, ${p.shipDaysMin || 7}, ${p.shipDaysMax || 15},
          ${p.storeId || ''}, ${p.storeName || ''}, ${p.storeRating || '0'}, ${(p.variants || []).length},
          ${'https://www.aliexpress.com/item/' + p.productId + '.html'},
          ${colors[0] || null}, ${JSON.stringify(colors)}, ${JSON.stringify(sizes)},
          ${p.material || null}, ${p.style || null}, ${p.gender || null}
        )`;

        // Insert variants
        for (const v of (p.variants || []).slice(0, 20)) {
          await sql`INSERT INTO ae_variants (
            ae_product_id, sku_id, sku_price_usd, sku_stock, sku_properties, color, size
          ) VALUES (
            ${p.productId}, ${v.skuId || ''}, ${parseFloat(v.price) || costUsd},
            ${v.stock || 0}, ${JSON.stringify(v.properties || [])},
            ${v.color || null}, ${v.size || null}
          ) ON CONFLICT DO NOTHING`;
        }

        imported++;
      } catch (e: any) {
        console.error(`[Import] Failed ${p.productId}:`, e.message);
        failed++;
      }
    }

    return NextResponse.json({ success: true, imported, skipped, failed, total: products.length });
  } catch (error: any) {
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
