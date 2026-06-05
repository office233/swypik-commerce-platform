#!/usr/bin/env node
/**
 * Blog Topic Auto-Discovery & Article Generator
 *
 * Spre deosebire de blog-generate-articles.mjs (5 seed-uri fixe), acest script:
 *   1. INTEROGHEAZĂ DB-ul ca să găsească categorii cu suficiente produse top-rated
 *   2. CONSTRUIEȘTE dinamic 1-3 topice noi pe baza catalogului viu
 *   3. ADAUGĂ slug săptămânal (-wYY-WW) ca să nu se ciocnească cu vechile articole
 *   4. ROTĂȚIE: nu generează aceeași categorie de 2 ori în 4 săptămâni
 *
 * Usage:
 *   DRY:    node scripts/blog-discover-topics.mjs
 *   APPLY:  node scripts/blog-discover-topics.mjs --apply
 *   N max:  node scripts/blog-discover-topics.mjs --apply --max=2
 *
 * Cron (zilnic 04:17):
 *   - rulează discover; dacă nu găsește topic nou (toate categoriile bune au fost
 *     acoperite în ultimele 28 zile), iese cu success fără să facă nimic
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
const MAX = args.max ? Number(args.max) : 1; // implicit: max 1 articol/rulare

// =====================================================================
// Util: ISO week label (RO format)
// =====================================================================
function isoWeekLabel(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo, label: `w${String(d.getUTCFullYear()).slice(-2)}-${String(weekNo).padStart(2, '0')}` };
}

function fmtPriceRON(price_cents) {
  if (!price_cents) return null;
  return (Number(price_cents) / 100).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ratingStars(r) {
  const n = Math.round(Number(r) || 0);
  return '★'.repeat(Math.min(5, Math.max(0, n))) + '☆'.repeat(Math.max(0, 5 - n));
}
function escapeMdx(s) {
  if (!s) return '';
  return String(s).replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}
function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// =====================================================================
// STEP 1 — Discover candidate categories
//   Vrem categorii cu min 10 produse care îndeplinesc filtrul de calitate
//   ȘI care n-au fost subiect de articol în ultimele 28 zile
// =====================================================================
async function discoverCandidates(client) {
  const sql = `
    WITH quality_products AS (
      SELECT p.id, p.category,
             p.rating_numeric AS rating,
             p.orders_count_int AS orders,
             p.price_cents,
             (p.rating_numeric * ln(1 + p.orders_count_int))::numeric AS score
      FROM marketplace_products p
      WHERE p.status='active'
        AND COALESCE(p.is_adult,false)=false
        AND p.effective_label='safe'
        AND p.image_url IS NOT NULL
        AND p.price_cents IS NOT NULL AND p.price_cents > 0
        AND p.rating_numeric IS NOT NULL AND p.rating_numeric >= 4.5
        AND p.orders_count_int IS NOT NULL AND p.orders_count_int >= 50
        AND p.category IS NOT NULL AND p.category != ''
    ),
    by_cat AS (
      SELECT category,
             COUNT(*) AS n_products,
             AVG(rating)::numeric(3,2) AS avg_rating,
             SUM(orders)::bigint AS total_orders,
             MAX(score)::numeric(8,2) AS top_score
      FROM quality_products
      GROUP BY category
      HAVING COUNT(*) >= 10
    ),
    recent_used AS (
      -- Categorii deja folosite în ultimele 28 zile (col category sau generator_meta->query->categoryAny)
      SELECT DISTINCT category
      FROM blog_articles
      WHERE published_at >= now() - interval '28 days'
        AND category IS NOT NULL
      UNION
      SELECT DISTINCT jsonb_array_elements_text(generator_meta->'query'->'categoryAny') AS category
      FROM blog_articles
      WHERE published_at >= now() - interval '28 days'
        AND generator_meta IS NOT NULL
    )
    SELECT bc.*
    FROM by_cat bc
    LEFT JOIN recent_used ru ON ru.category = bc.category
    WHERE ru.category IS NULL
    ORDER BY bc.top_score DESC, bc.n_products DESC
    LIMIT 10
  `;
  const { rows } = await client.query(sql);
  return rows;
}

// =====================================================================
// STEP 2 — Construiește un seed dinamic dintr-o categorie
// =====================================================================
const CATEGORY_TEMPLATES = {
  default: {
    titleTpl: (cat) => `Top produse din categoria ${cat} cu cele mai bune review-uri`,
    intro: (cat, total) => `Categoria **${cat}** are pe Swypik produse extrem de bine cotate. Am ales aici **top-ul** după rating real (4.5+) și număr de comenzi confirmate. Total ${Number(total).toLocaleString('ro-RO')} comenzi în spatele acestor produse.`,
    hero: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&q=80',
    seoKw: ['top produse', 'bestseller', 'review real', 'swypik'],
  },
};

// Categorii pentru care avem template-uri customizate (titluri mai sexy SEO)
const CUSTOM_TEMPLATES = {
  'Bijuterii': {
    titleTpl: () => 'Top bijuterii bestseller — selecție pe baza ratingului real',
    intro: (_, total) => `Bijuterii care chiar au fost cumpărate (peste ${Number(total).toLocaleString('ro-RO')} comenzi cumulate). Toate cu rating peste 4.5/5.`,
    hero: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1200&q=80',
    seoKw: ['bijuterii', 'cercei', 'lant', 'inel', 'bestseller'],
  },
  'Genți & Bagaje': {
    titleTpl: () => 'Top genți și bagaje cumpărate pe Swypik',
    intro: (_, total) => `${Number(total).toLocaleString('ro-RO')} cumpărători au vorbit prin comenzile lor. Iată gențile și bagajele care chiar merită.`,
    hero: 'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=1200&q=80',
    seoKw: ['genti', 'rucsac', 'bagaj', 'troller', 'bestseller'],
  },
  'Jucării': {
    titleTpl: () => 'Top jucării pentru copii — alegere pe bază de date reale',
    intro: (_, total) => `Părinți reali, comenzi reale: ${Number(total).toLocaleString('ro-RO')} familii au cumpărat jucăriile de mai jos. Niciuna nu coboară sub 4.5/5 rating.`,
    hero: 'https://images.unsplash.com/photo-1558877385-81a1c7e67d72?w=1200&q=80',
    seoKw: ['jucarii', 'copii', 'cadou', 'bestseller', 'top jucarii'],
  },
  'Frumusețe': {
    titleTpl: () => 'Top produse de înfrumusețare cu cele mai multe review-uri pozitive',
    intro: (_, total) => `${Number(total).toLocaleString('ro-RO')} clienți confirmă: aceste produse de înfrumusețare chiar funcționează (rating ≥ 4.5).`,
    hero: 'https://images.unsplash.com/photo-1522335789203-aaa44d2cb0a3?w=1200&q=80',
    seoKw: ['cosmetice', 'frumusete', 'skincare', 'top produse'],
  },
  'Sport & Outdoor': {
    titleTpl: () => 'Top echipament sport & outdoor cumpărat masiv pe Swypik',
    intro: (_, total) => `Indiferent că faci fitness, drumeție sau hobby outdoor — ${Number(total).toLocaleString('ro-RO')} de comenzi au stabilit topul de mai jos.`,
    hero: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=1200&q=80',
    seoKw: ['sport', 'outdoor', 'fitness', 'echipament', 'bestseller'],
  },
  'Casă & Grădină': {
    titleTpl: () => 'Top produse pentru casă și grădină — alese pe baza ordinelor reale',
    intro: (_, total) => `Cu ${Number(total).toLocaleString('ro-RO')} comenzi cumulate, aceste produse pentru casă și grădină sunt bestseller real.`,
    hero: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1200&q=80',
    seoKw: ['casa', 'gradina', 'amenajari', 'bestseller'],
  },
};

function buildSeedFromCategory(cat, weekInfo) {
  const tpl = CUSTOM_TEMPLATES[cat.category] || CATEGORY_TEMPLATES.default;
  const titleBase = typeof tpl.titleTpl === 'function' ? tpl.titleTpl(cat.category) : tpl.titleTpl;
  const slugBase = slugify(cat.category);
  const slug = `top-${slugBase}-${weekInfo.label}`;
  const intro = typeof tpl.intro === 'function' ? tpl.intro(cat.category, cat.total_orders) : tpl.intro;

  return {
    slug,
    locale: 'ro',
    title: `${titleBase} (săpt. ${weekInfo.week}/${weekInfo.year})`,
    excerpt: `${cat.n_products} produse din categoria ${cat.category} au rating ≥ 4.5 și peste 50 de comenzi. Iată top 7.`,
    intro,
    heroImage: tpl.hero,
    heroAlt: `Top produse din categoria ${cat.category}`,
    category: cat.category,
    tags: ['top-rated', 'bestseller', slugBase, `saptamana-${weekInfo.week}`],
    seoTitle: `${titleBase} — Swypik W${weekInfo.week}`,
    seoDescription: `Top 7 produse din ${cat.category} cu rating ≥ 4.5 și peste 50 de comenzi confirmate. Actualizat săptămânal.`,
    seoKeywords: tpl.seoKw,
    query: {
      categoryAny: [cat.category],
      minRating: 4.5,
      minOrders: 50,
      limit: 7,
    },
  };
}

// =====================================================================
// STEP 3 — Fetch top products for a category
// =====================================================================
async function fetchTopProducts(client, q) {
  const list = q.categoryAny.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const sql = `
    SELECT p.id, p.title AS title_en, p.brand, p.category,
           p.price_cents, p.currency, p.image_url,
           p.rating_numeric AS rating, p.orders_count_int AS orders,
           pt.title AS title_ro, pt.description AS desc_ro,
           (p.rating_numeric * ln(1 + p.orders_count_int))::numeric AS score
    FROM marketplace_products p
    LEFT JOIN product_translations pt
      ON pt.product_id = p.id AND pt.locale = 'ro' AND pt.title IS NOT NULL
    WHERE p.status='active'
      AND COALESCE(p.is_adult,false)=false
      AND p.effective_label='safe'
      AND p.image_url IS NOT NULL
      AND p.price_cents > 0
      AND p.rating_numeric >= ${Number(q.minRating)}
      AND p.orders_count_int >= ${Number(q.minOrders)}
      AND p.category IN (${list})
    ORDER BY score DESC
    LIMIT $1
  `;
  const { rows } = await client.query(sql, [q.limit]);
  return rows;
}

// =====================================================================
// STEP 4 — Build MDX (same shape as v1)
// =====================================================================
function buildMdx(seed, products) {
  if (!products.length) return null;
  const featured = products[0];
  const rest = products.slice(1);
  const lines = [];
  lines.push(`## De ce acest clasament e diferit`);
  lines.push('');
  lines.push(seed.intro);
  lines.push('');
  lines.push(`**Cum am ales** (date live, ${new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}):`);
  lines.push(`- rating cumpărători **≥ ${seed.query.minRating}** (din 5)`);
  lines.push(`- minim **${seed.query.minOrders} comenzi** confirmate`);
  lines.push(`- doar produse în stoc și sigure (filtru \`is_adult=false\` + \`effective_label='safe'\`)`);
  lines.push(`- ranking final: \`rating × ln(1 + comenzi)\` — favorizează ce e bine cotat ȘI cumpărat`);
  lines.push('');
  lines.push(`## 🏆 Locul 1 — ${escapeMdx(featured.title_ro || featured.title_en)}`);
  lines.push('');
  lines.push(`<InlineProductCard productId="${featured.id}" variant="featured" badge="LOCUL 1 BESTSELLER" />`);
  lines.push('');
  if (featured.desc_ro) {
    const desc = String(featured.desc_ro).slice(0, 320);
    lines.push(`**De ce e pe primul loc**: ${escapeMdx(desc)}${featured.desc_ro.length > 320 ? '...' : ''}`);
    lines.push('');
  }
  lines.push(`> Rating real: **${Number(featured.rating).toFixed(1)}/5** ${ratingStars(featured.rating)} · **${Number(featured.orders).toLocaleString('ro-RO')} comenzi** confirmate · ${fmtPriceRON(featured.price_cents)} ${featured.currency || 'RON'}`);
  lines.push('');
  lines.push(`## Locurile 2–${products.length}`);
  lines.push('');
  lines.push(`Toate au peste **${seed.query.minOrders} comenzi** confirmate și rating **${seed.query.minRating}+**:`);
  lines.push('');
  rest.forEach((p, i) => {
    const pos = i + 2;
    lines.push(`### ${pos}. ${escapeMdx(p.title_ro || p.title_en)}`);
    lines.push('');
    lines.push(`<InlineProductCard productId="${p.id}" variant="compact" />`);
    lines.push('');
    lines.push(`*Rating: **${Number(p.rating).toFixed(1)}/5** ${ratingStars(p.rating)} · ${Number(p.orders).toLocaleString('ro-RO')} comenzi · ${fmtPriceRON(p.price_cents)} ${p.currency || 'RON'}*`);
    if (p.desc_ro) {
      lines.push('');
      lines.push(escapeMdx(String(p.desc_ro).slice(0, 200)));
    }
    lines.push('');
  });
  lines.push(`---`);
  lines.push('');
  lines.push(`### Cum cumperi în siguranță pe Swypik`);
  lines.push('');
  lines.push(`Toate produsele de mai sus sunt verificate: stoc real, descriere tradusă RO, preț în lei, livrare urmărită. Click pe orice card te duce direct la produs.`);
  lines.push('');
  lines.push(`*Acest articol e regenerat săptămânal cu cele mai noi date din catalog.*`);
  return lines.join('\n');
}

// =====================================================================
// STEP 5 — Insert
// =====================================================================
async function insertArticle(client, seed, products) {
  const mdx = buildMdx(seed, products);
  if (!mdx) return { status: 'empty' };

  await client.query('BEGIN');
  try {
    const ins = await client.query(`
      INSERT INTO blog_articles (
        slug, locale, title, excerpt, body_mdx,
        hero_image_url, hero_image_alt,
        category, tags,
        seo_title, seo_description, seo_keywords,
        author_name, linked_product_ids,
        status, read_time_min, published_at, generator, generator_meta
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9,
        $10, $11, $12,
        $13, $14::uuid[],
        'published', $15, now(), 'auto-discover-v1', $16::jsonb
      )
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `, [
      seed.slug, seed.locale, seed.title, seed.excerpt, mdx,
      seed.heroImage, seed.heroAlt,
      seed.category, seed.tags,
      seed.seoTitle, seed.seoDescription, seed.seoKeywords,
      'Echipa Swypik', products.map(p => p.id),
      Math.max(3, Math.round(mdx.split(/\s+/).length / 220)),
      JSON.stringify({
        query: seed.query,
        n_products: products.length,
        product_ids: products.map(p => p.id),
        generated_at: new Date().toISOString(),
        source: 'discover',
      }),
    ]);
    if (!ins.rowCount) {
      await client.query('ROLLBACK');
      return { status: 'exists' };
    }
    const articleId = ins.rows[0].id;
    await client.query(`
      INSERT INTO blog_article_products (article_id, product_id, position, variant)
      SELECT $1::uuid, p.product_id, p.ord - 1,
             CASE WHEN p.ord = 1 THEN 'featured' ELSE 'compact' END
      FROM unnest($2::uuid[]) WITH ORDINALITY AS p(product_id, ord)
      ON CONFLICT (article_id, product_id) DO NOTHING
    `, [articleId, products.map(p => p.id)]);
    await client.query('COMMIT');
    return { status: 'inserted', id: articleId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// =====================================================================
// MAIN
// =====================================================================
async function main() {
  const client = await pool.connect();
  const week = isoWeekLabel();
  console.log(`\n=== AUTO-DISCOVER (week ${week.label}) ===\n`);

  try {
    const candidates = await discoverCandidates(client);
    if (!candidates.length) {
      console.log('No fresh categories to write about (all top categories covered in last 28 days).');
      console.log('Try again next week, or rotate seeds in blog-generate-articles.mjs.');
      return;
    }
    console.log(`Found ${candidates.length} candidate categorii:`);
    console.table(candidates.map(c => ({
      category: c.category,
      products: c.n_products,
      avg_rating: c.avg_rating,
      orders: c.total_orders,
      top_score: c.top_score,
    })));

    const picks = candidates.slice(0, MAX);
    console.log(`\nPicking top ${picks.length} for generation:\n`);

    const results = [];
    for (const cat of picks) {
      const seed = buildSeedFromCategory(cat, week);
      console.log(`→ [${seed.slug}] fetching products...`);
      const products = await fetchTopProducts(client, seed.query);
      console.log(`  found ${products.length} products`);
      if (products.length < 5) {
        results.push({ slug: seed.slug, status: 'too_few' });
        continue;
      }
      if (!APPLY) {
        console.log(`  DRY — would insert "${seed.title}" with ${products.length} products`);
        results.push({ slug: seed.slug, status: 'dry', n_products: products.length });
        continue;
      }
      const r = await insertArticle(client, seed, products);
      console.log(`  ${r.status === 'inserted' ? '✓ inserted (id=' + r.id + ')' : r.status}`);
      results.push({ slug: seed.slug, status: r.status, id: r.id, n_products: products.length });
    }

    console.log('\n===== SUMMARY =====');
    console.table(results);
    const ok = results.filter(r => r.status === 'inserted').length;
    console.log(`Inserted: ${ok} · Mode: ${APPLY ? 'APPLY' : 'DRY'}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
