#!/usr/bin/env node
/**
 * Blog EN Translator
 *
 * Pentru fiecare articol RO din `blog_articles`, generează variantă EN în
 * `blog_article_translations`:
 *   - Re-fetch produsele linkate (folosește titlurile EN originale din DB)
 *   - Reconstruiește MDX cu section labels în engleză + rating/orders/price
 *   - Slug EN derivat: `<original-slug>` (același — SEO păstrează context)
 *   - Title/excerpt EN — template-uri natale, nu LLM
 *
 * Usage:
 *   DRY:    node scripts/blog-translate-en.mjs
 *   APPLY:  node scripts/blog-translate-en.mjs --apply
 *   ONE:    node scripts/blog-translate-en.mjs --apply --slug=top-electronice-2026
 *   FORCE:  --force  (overwrite existing translation)
 */
import pg from 'pg';
const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const APPLY = Boolean(args.apply);
const FORCE = Boolean(args.force);
const ONLY = args.slug ? String(args.slug) : null;

// =====================================================================
// EN templates per category (mapează categoria RO → EN copy)
// =====================================================================
const CATEGORY_EN = {
  'Modă': 'Fashion',
  'Tehnologie': 'Tech',
  'Casă & Birou': 'Home & Office',
  'Casă & Grădină': 'Home & Garden',
  'Frumusețe': 'Beauty',
  'Sport & Outdoor': 'Sports & Outdoor',
  'Jucării': 'Toys',
  'Bijuterii': 'Jewelry',
  'Genți & Bagaje': 'Bags & Luggage',
  'Igienă dentară': 'Dental Care',
  'Pantaloni': 'Pants',
  'Încălțăminte': 'Footwear',
  'Calculatoare': 'Computers',
  'Genți': 'Bags',
  'Accesorii frumusețe': 'Beauty Accessories',
  'Birotică': 'Office Supplies',
  'Electronice': 'Electronics',
  'Încărcătoare & cabluri': 'Chargers & Cables',
  'Încărcătoare': 'Chargers',
  'Cabluri': 'Cables',
  'Căști': 'Headphones',
  'Boxe': 'Speakers',
  'Tricouri': 'T-shirts',
  'Bluze': 'Blouses',
  'Pantofi': 'Shoes',
  'Sandale': 'Sandals',
  'Adidași': 'Sneakers',
  'Ceasuri': 'Watches',
  'Ochelari': 'Glasses',
  'Parfumuri': 'Perfumes',
  'Cosmetice': 'Cosmetics',
  'Jocuri': 'Games',
  'Cărți': 'Books',
  'Lenjerie': 'Underwear',
  "Genți damă": "Women's Bags",
  "Genți barbati": "Men's Bags",
  'Portofele': 'Wallets',
  'Pantaloni Scurți': 'Shorts', 'Pantaloni scurți': 'shorts',
  'Fashion': 'Fashion', 'Men': 'Men', 'Women': 'Women', 'Kids': 'Kids',
};

/**
 * Translate a (possibly compound) category like 'Fashion > Men > Pantaloni Scurți'
 * into a clean leaf label. Falls back to raw leaf if unmapped.
 */
function translateCategoryEn(raw) {
  if (!raw) return '';
  if (CATEGORY_EN[raw]) return CATEGORY_EN[raw];
  const segments = String(raw).split(/\s*>\s*/).map((s) => s.trim()).filter(Boolean);
  const leaf = segments[segments.length - 1] || raw;
  return CATEGORY_EN[leaf] || leaf;
}

// =====================================================================
// Translate title: RO → EN via pattern matching
// =====================================================================
function translateTitle(roTitle, articleCategory) {
  let t = roTitle;
  // Common phrase replacements (longest first)
  const replacements = [
    [/Top (\d+) gadget-uri electronice care chiar merită (\d+)/i, 'Top $1 Electronic Gadgets That Are Actually Worth It in $2'],
    [/Top (\d+) papuci de casă pe care chiar îi cumpără lumea în (\d+)/i, 'Top $1 House Slippers People Actually Buy in $2'],
    [/Cele mai vândute rochii de vară pe Swypik în (\d+)/i, 'Best-Selling Summer Dresses on Swypik in $1'],
    [/Top (\d+) folii de protecție telefon (\d+).*$/i, 'Top $1 Phone Screen Protectors $2 — Tested by Real Buyers'],
    [/Top accesorii de birou \(Birotică\) cumpărate masiv în (\d+)/i, 'Top Office Supplies Bought Heavily in $1'],
    [/Top produse din categoria (.+?) cu cele mai bune review-uri/i, (m, p1) => `Top ${translateCategoryEn(p1)} Products with the Best Reviews`],
    [/\(săpt\. (\d+)\/(\d+)\)/i, '(Week $1/$2)'],
    [/Top (\d+) bijuterii bestseller/i, 'Top $1 Bestselling Jewelry'],
    [/Top jucării pentru copii/i, 'Top Toys for Kids'],
  ];
  let matched = false;
  for (const [re, rep] of replacements) {
    if (re.test(t)) {
      t = t.replace(re, rep);
      matched = true;
    }
  }
  if (matched) return t;
  // Fallback: literal category map
  const cat = translateCategoryEn(articleCategory);
  if (cat) {
    return `Top ${cat} Products on Swypik`;
  }
  return roTitle; // Last-resort: leave as-is (better than wrong translation)
}

function translateExcerpt(roExcerpt, n_products, category) {
  if (!roExcerpt) return null;
  const catEn = translateCategoryEn(category);
  // Pattern: "Top X produse din categoria Y au rating ≥ 4.5 și peste 50 de comenzi. Iată top 7."
  if (/au rating.*comenzi/i.test(roExcerpt)) {
    return `${n_products} products in ${catEn} have a rating of 4.5+ and over 50 confirmed orders. Here's the top 7.`;
  }
  if (/extras top/i.test(roExcerpt) || /sortate dup/i.test(roExcerpt)) {
    return `Top ${n_products} real products from Swypik, ranked by rating and confirmed order count. Data updated regularly.`;
  }
  if (/Folii de sticl/i.test(roExcerpt)) {
    return `Tempered glass, hydrogel and matte protectors — sorted by real rating (4.3+) and 23k+ orders. Here are the winners.`;
  }
  return `Top ${n_products} products selected from real Swypik catalog data. Rating, price and confirmed orders included.`;
}

// =====================================================================
// MDX builder (EN section labels, RO data values translated)
// =====================================================================
function fmtPriceRON(price_cents) {
  if (!price_cents) return null;
  return (Number(price_cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ratingStars(r) {
  const n = Math.round(Number(r) || 0);
  return '★'.repeat(Math.min(5, Math.max(0, n))) + '☆'.repeat(Math.max(0, 5 - n));
}
function escapeMdx(s) {
  if (!s) return '';
  return String(s).replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function buildEnMdx(article, products) {
  if (!products.length) return null;
  const featured = products[0];
  const rest = products.slice(1);
  const minRating = article.generator_meta?.query?.minRating ?? 4.5;
  const minOrders = article.generator_meta?.query?.minOrders ?? 50;
  const lines = [];
  lines.push(`## Why This Ranking Is Different`);
  lines.push('');
  lines.push(`Not editorial picks — pure data. We pulled every product in this category with **rating ≥ ${minRating}** and **${minOrders}+ confirmed orders** on Swypik, then ranked them by composite score \`rating × ln(1 + orders)\`.`);
  lines.push('');
  lines.push(`**How we picked** (live data, ${new Date(article.published_at || Date.now()).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}):`);
  lines.push(`- buyer rating **≥ ${minRating}** (out of 5)`);
  lines.push(`- minimum **${minOrders} confirmed orders**`);
  lines.push(`- in-stock + safety-filtered products only (\`is_adult=false\`, \`effective_label='safe'\`)`);
  lines.push(`- ranking formula: \`rating × ln(1 + orders)\` — favors products both well-rated AND bought`);
  lines.push('');
  lines.push(`## 🏆 #1 — ${escapeMdx(featured.title_en || featured.title_ro)}`);
  lines.push('');
  lines.push(`<InlineProductCard productId="${featured.id}" variant="featured" badge="#1 BESTSELLER" />`);
  lines.push('');
  if (featured.desc_en) {
    const desc = String(featured.desc_en).slice(0, 320);
    lines.push(`**Why it's #1**: ${escapeMdx(desc)}${featured.desc_en.length > 320 ? '...' : ''}`);
    lines.push('');
  }
  lines.push(`> Real rating: **${Number(featured.rating).toFixed(1)}/5** ${ratingStars(featured.rating)} · **${Number(featured.orders).toLocaleString('en-US')} confirmed orders** · RON ${fmtPriceRON(featured.price_cents)}`);
  lines.push('');
  lines.push(`## #2 – #${products.length}`);
  lines.push('');
  lines.push(`All have **${minOrders}+ confirmed orders** and rating **${minRating}+**:`);
  lines.push('');
  rest.forEach((p, i) => {
    const pos = i + 2;
    lines.push(`### ${pos}. ${escapeMdx(p.title_en || p.title_ro)}`);
    lines.push('');
    lines.push(`<InlineProductCard productId="${p.id}" variant="compact" />`);
    lines.push('');
    lines.push(`*Rating: **${Number(p.rating).toFixed(1)}/5** ${ratingStars(p.rating)} · ${Number(p.orders).toLocaleString('en-US')} orders · RON ${fmtPriceRON(p.price_cents)}*`);
    if (p.desc_en) {
      lines.push('');
      lines.push(escapeMdx(String(p.desc_en).slice(0, 200)));
    }
    lines.push('');
  });
  lines.push(`---`);
  lines.push('');
  lines.push(`### How to Buy Safely on Swypik`);
  lines.push('');
  lines.push(`All products above are verified by our team: real stock, English description, transparent pricing, tracked shipping. Click any card to go straight to the product — add to cart and you're done.`);
  lines.push('');
  lines.push(`*This article is refreshed weekly with the latest catalog data.*`);
  return lines.join('\n');
}

// =====================================================================
// Fetch products with EN translations (or original titles)
// =====================================================================
async function fetchProducts(client, productIds) {
  if (!productIds.length) return [];
  const sql = `
    SELECT p.id,
           p.title AS title_en,
           p.brand, p.category,
           p.price_cents, p.currency, p.image_url,
           p.rating_numeric AS rating,
           p.orders_count_int AS orders,
           p.description AS desc_en_raw,
           pt_en.title AS title_en_override,
           pt_en.description AS desc_en_override,
           pt_ro.title AS title_ro,
           pt_ro.description AS desc_ro
    FROM marketplace_products p
    LEFT JOIN product_translations pt_en
      ON pt_en.product_id = p.id AND pt_en.locale = 'en'
    LEFT JOIN product_translations pt_ro
      ON pt_ro.product_id = p.id AND pt_ro.locale = 'ro'
    WHERE p.id = ANY($1::uuid[])
  `;
  const { rows } = await client.query(sql, [productIds]);
  // Re-order to match input order (important for ranking)
  const byId = new Map(rows.map(r => [r.id, r]));
  return productIds.map(id => byId.get(id)).filter(Boolean).map(r => ({
    ...r,
    title_en: r.title_en_override || r.title_en,
    desc_en: r.desc_en_override || r.desc_en_raw,
  }));
}

// =====================================================================
// MAIN
// =====================================================================
async function processArticle(client, article) {
  const products = await fetchProducts(client, article.linked_product_ids || []);
  if (products.length < 3) {
    console.warn(`[${article.slug}] SKIP — only ${products.length} products available`);
    return { slug: article.slug, status: 'too_few' };
  }

  const enTitle = translateTitle(article.title, article.category);
  const enExcerpt = translateExcerpt(article.excerpt, products.length, article.category);
  const enMdx = buildEnMdx(article, products);
  if (!enMdx) return { slug: article.slug, status: 'empty' };

  if (!APPLY) {
    console.log(`[${article.slug}] DRY EN preview:`);
    console.log(`  title:   ${enTitle}`);
    console.log(`  excerpt: ${enExcerpt}`);
    console.log(`  mdx:     ${enMdx.slice(0, 300)}...`);
    return { slug: article.slug, status: 'dry' };
  }

  // Slug EN = aceeași — articol unic cu 2 traduceri (canonical = RO, /en/blog/<slug> servește varianta EN)
  const enSlug = article.slug;
  const enSeoTitle = `${enTitle} | Swypik`;

  await client.query(`
    INSERT INTO blog_article_translations
      (article_id, locale, title, excerpt, body_mdx, slug, seo_title, seo_description, source, model_tag)
    VALUES
      ($1, 'en', $2, $3, $4, $5, $6, $7, 'template-en-v1', 'native-en-template')
    ${FORCE ? 'ON CONFLICT (article_id, locale) DO UPDATE SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_mdx=EXCLUDED.body_mdx, slug=EXCLUDED.slug, seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description, source=EXCLUDED.source, model_tag=EXCLUDED.model_tag, updated_at=now()' : 'ON CONFLICT (article_id, locale) DO NOTHING'}
    RETURNING article_id
  `, [
    article.id, enTitle, enExcerpt, enMdx, enSlug, enSeoTitle, enExcerpt,
  ]);

  console.log(`[${article.slug}] ✓ EN translation inserted`);
  return { slug: article.slug, status: 'inserted', title_en: enTitle };
}

async function main() {
  const client = await pool.connect();
  try {
    const where = ONLY ? `WHERE a.slug=$1 AND a.locale='ro'` : `WHERE a.locale='ro' AND a.status='published'`;
    const sql = `
      SELECT a.id, a.slug, a.title, a.excerpt, a.category, a.tags,
             a.linked_product_ids, a.generator_meta, a.published_at,
             t.locale AS has_en
      FROM blog_articles a
      LEFT JOIN blog_article_translations t ON t.article_id = a.id AND t.locale='en'
      ${where}
      ORDER BY a.published_at DESC
    `;
    const { rows: articles } = ONLY ? await client.query(sql, [ONLY]) : await client.query(sql);
    console.log(`\nFound ${articles.length} RO articles to process`);

    const toProcess = FORCE ? articles : articles.filter(a => !a.has_en);
    console.log(`${toProcess.length} need EN translation (FORCE=${FORCE})`);

    const results = [];
    for (const article of toProcess) {
      try {
        const r = await processArticle(client, article);
        results.push(r);
      } catch (err) {
        console.error(`[${article.slug}] ERROR`, err.message);
        results.push({ slug: article.slug, status: 'error', error: err.message });
      }
    }

    console.log('\n===== SUMMARY =====');
    console.table(results);
    const ok = results.filter(r => r.status === 'inserted').length;
    console.log(`Translated: ${ok} · Mode: ${APPLY ? 'APPLY' : 'DRY'}${FORCE ? ' (FORCE)' : ''}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
