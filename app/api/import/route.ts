/**
 * API endpoint for Chrome Extension v6 — receives scraped product data
 * No AliExpress API needed! Data comes directly from DOM scraping.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";
import crypto from "crypto";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";


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

const CATEGORY_RULES = [
  { name: "Women's Fashion", nameRo: "Moda femei", keywords: ["women", "woman", "female", "dress", "skirt", "blouse", "bra", "lingerie", "bikini", "leggings", "jumpsuit", "bodysuit"] },
  { name: "Men's Fashion", nameRo: "Moda barbati", keywords: ["men", "man", "male", "shirt", "polo", "suit", "tie", "boxer", "trousers"] },
  { name: "Shoes", nameRo: "Incaltaminte", keywords: ["shoe", "sneaker", "sandal", "boot", "slipper", "heel", "loafer"] },
  { name: "Bags & Wallets", nameRo: "Genti si portofele", keywords: ["bag", "wallet", "purse", "backpack", "handbag", "clutch"] },
  { name: "Jewelry & Watches", nameRo: "Bijuterii si ceasuri", keywords: ["jewelry", "necklace", "ring", "earring", "bracelet", "watch", "pendant"] },
  { name: "Beauty", nameRo: "Beauty", keywords: ["makeup", "cosmetic", "beauty", "cream", "serum", "lipstick", "nail", "eyelash", "wig", "hair"] },
  { name: "Home & Kitchen", nameRo: "Casa si bucatarie", keywords: ["home", "kitchen", "bathroom", "decor", "storage", "organizer", "lamp", "curtain", "pillow", "blanket"] },
  { name: "Electronics", nameRo: "Electronice", keywords: ["phone", "usb", "charger", "bluetooth", "earphone", "headphone", "case", "cable", "smart", "camera"] },
  { name: "Sports & Outdoors", nameRo: "Sport si outdoor", keywords: ["sport", "fitness", "yoga", "gym", "bike", "bicycle", "camping", "outdoor"] },
  { name: "Kids & Baby", nameRo: "Copii si bebelusi", keywords: ["baby", "kids", "children", "toy", "girl", "boy", "toddler"] },
  { name: "Auto & Tools", nameRo: "Auto si unelte", keywords: ["car", "auto", "motorcycle", "tool", "repair", "drill", "screwdriver"] },
  { name: "Pet Supplies", nameRo: "Produse animale", keywords: ["pet", "dog", "cat", "leash", "collar", "aquarium"] },
];

function classifyCategory(product: any) {
  const text = [
    product.categoryName,
    product.category,
    product.title,
    product.description,
    product.gender,
    product.material,
    product.style,
  ].filter(Boolean).join(" ").toLowerCase();
  const ranked = CATEGORY_RULES.map((rule) => ({
    rule,
    score: rule.keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].rule : { name: "General", nameRo: "General" };
}

export async function POST(req: NextRequest) {
  try {
    const importSecret = process.env.IMPORT_SECRET;
    if (!importSecret) {
      return NextResponse.json({ error: "Import endpoint is not configured" }, { status: 503 });
    }
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
    }

    const secret = req.headers.get("x-import-secret") || "";
    try {
      if (!crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(importSecret))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIP(req);
    const { success } = await rateLimit("import", ip, { limit: 5, window: 60 });
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const products = Array.isArray(body) ? body : [body];

    if (products.length > 50) {
      return NextResponse.json({ error: "Prea multe produse într-un singur request (max 50)" }, { status: 400 });
    }
    let imported = 0, skipped = 0, failed = 0;

    for (const p of products) {
      try {
        if (!p.productId) { failed++; continue; }

        // Check if exists
        const { rows: existing } = await dbQuery(
          "SELECT id FROM ae_products WHERE ae_product_id = $1",
          [p.productId]
        );
        if (existing.length > 0) { skipped++; continue; }

        const costUsd = parseFloat(p.price) || 0;
        const shipUsd = parseFloat(p.shippingPrice) || 0;
        if (costUsd <= 0) { failed++; continue; }

        const { price, oldPrice, markup } = calculatePriceRON(costUsd, shipUsd);
        const images = (p.images || []).slice(0, 8);
        const colors = p.colors || [...new Set((p.variants || []).filter((v: any) => v.color).map((v: any) => v.color))];
        const sizes = p.sizes || [...new Set((p.variants || []).filter((v: any) => v.size).map((v: any) => v.size))];
        const totalStock = (p.variants || []).reduce((s: number, v: any) => s + (v.stock || 0), 0) || p.availableStock || 0;
        const categoryId = Number(p.categoryId) || 0;
        if (categoryId > 0) {
          const category = classifyCategory(p);
          await dbQuery(
            `INSERT INTO ae_categories (ae_category_id, name, name_ro, level, is_active)
             VALUES ($1, $2, $3, 2, true)
             ON CONFLICT (ae_category_id)
             DO UPDATE SET
               name = CASE WHEN ae_categories.name ~ '^AE-[0-9]+$' THEN EXCLUDED.name ELSE ae_categories.name END,
               name_ro = COALESCE(ae_categories.name_ro, EXCLUDED.name_ro),
               is_active = true`,
            [categoryId, category.name, category.nameRo]
          );
        }

        await dbQuery(`INSERT INTO ae_products (
          ae_product_id, category_id, title, description, min_price_usd, max_price_usd, original_price_usd,
          price_ron, old_price_ron, markup, main_image, images, video_url, video_poster, has_video,
          rating, rating_count, orders_count, product_status, brand, properties,
          ship_method, ship_cost_usd, ship_free, ship_days_min, ship_days_max, ship_tracking, ship_from,
          store_id, store_name, store_rating, variants_count, source_url, delivery_date_desc,
          neckline, style, fabric_type, color, colors, sizes, material, pattern_type,
          sleeve_style, waistline, season, silhouette, decoration, gender,
          free_shipping_threshold, available_stock
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,$11,$12,$13,$14,$15,
          $16,$17,$18,'onSelling',$19,$20,
          $21,$22,$23,$24,$25,$26,$27,
          $28,$29,$30,$31,$32,$33,
          $34,$35,$36,
          $37,$38,$39,$40,$41,
          $42,$43,$44,$45,$46,$47,
          $48,$49
        )`, [
          p.productId, categoryId, p.title || "", p.description || "",
          costUsd, p.maxPrice || costUsd, p.originalPrice || null,
          price, oldPrice, markup,
          images[0] || "", images,
          p.videoUrl || null, p.videoPoster || null, !!p.videoUrl,
          p.rating || 0, p.ratingCount || 0, p.orders || 0,
          p.brand || null, JSON.stringify(p.properties || []),
          p.shippingMethod || "", shipUsd, p.shipFree || shipUsd === 0,
          p.shipDaysMin || 7, p.shipDaysMax || 15, true, p.shipFrom || "CN",
          p.storeId || "", p.storeName || "", p.storeRating || "0",
          (p.variants || []).length,
          `https://www.aliexpress.com/item/${p.productId}.html`,
          p.deliveryDateDesc || null,
          p.neckline || null, p.style || null, p.fabricType || null,
          colors[0] || null, colors, sizes,
          p.material || null, p.patternType || null,
          p.sleeveStyle || null, p.waistline || null, p.season || null,
          p.silhouette || null, p.decoration || [], p.gender || null,
          p.freeShippingThreshold || null, totalStock,
        ]);

        // Insert variants
        for (const v of (p.variants || []).slice(0, 20)) {
          const skuPriceUsd = parseFloat(v.price) || costUsd;
          const skuOriginalUsd = parseFloat(v.originalPrice) || skuPriceUsd;
          const skuRon = calculatePriceRON(skuPriceUsd, shipUsd).price;
          const variantName = v.name || v.title || [v.color, v.size].filter(Boolean).join(" / ") || "Standard";

          await dbQuery(`INSERT INTO ae_variants (
            product_id, sku_id, price_usd, original_price_usd, price_ron,
            variant_name, variant_image, stock, properties, color, size
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
          ) ON CONFLICT (product_id, sku_id) DO NOTHING`, [
            p.productId, v.skuId || "", skuPriceUsd, skuOriginalUsd, skuRon,
            variantName, v.image || v.variantImage || null, v.stock || 0,
            JSON.stringify(v.properties || []), v.color || null, v.size || null,
          ]);
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
