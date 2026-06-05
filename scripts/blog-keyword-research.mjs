#!/usr/bin/env node
/**
 * blog-keyword-research.mjs
 *
 * Demand-driven keyword discovery folosind Google Autocomplete (gratis, fără API key).
 *
 * Pipeline:
 *  1. Ia categoriile cu produse de calitate (rating ≥ 4.5, orders ≥ 50) din marketplace_products
 *  2. Pentru fiecare combinație (seed × categorie), fetch Google Autocomplete
 *  3. Calculează scoruri:
 *     - commercial_intent_score (0-100): cuvinte "best/top/review/2026/vs/cheap" → +20 fiecare
 *     - product_supply_score (0-100): câte produse de calitate match titlul → 0/20/50/75/100
 *     - composite_score (0-1000): intent × position_bonus × supply / 100
 *  4. UPSERT în blog_keyword_candidates ON CONFLICT (keyword, locale)
 *
 * CLI:
 *   --apply              (default dry-run)
 *   --locale=ro|en|all   (default all)
 *   --max-queries=N      (default 50 per locale)
 *   --rate-ms=N          (default 800)
 *
 * Uses native fetch (Node 18+). NO API key needed.
 */

import pg from 'pg';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  })
);

const APPLY = !!args.apply;
const LOCALE_ARG = args.locale || 'all';
const MAX_QUERIES = parseInt(args['max-queries'] || '50', 10);
const RATE_MS = parseInt(args['rate-ms'] || '800', 10);

const LOCALES = LOCALE_ARG === 'all' ? ['ro', 'en'] : LOCALE_ARG.split(',');

// ===== Seeds commerciale =====
const SEEDS = {
  ro: [
    'cele mai bune',
    'top',
    'recenzii',
    'review',
    'comparativ',
    'ieftin',
    'pret bun',
    'recomandari',
    'pareri',
    'ce sa cumpar',
    'lista',
    'ghid',
    '2026',
  ],
  en: [
    'best',
    'top',
    'review',
    'reviews',
    'vs',
    'cheap',
    'budget',
    'comparison',
    'guide',
    '2026',
    'recommended',
    'best of',
    'alternative to',
  ],
};

// ===== Category translation EN (mapping minim) =====
const CATEGORY_EN_MAP = {
  'igienă dentară': 'dental care',
  'calculatoare': 'computers',
  'hanorace bărbați': 'mens hoodies',
  'geci & paltoane femei': 'womens jackets',
  'piese auto': 'auto parts',
  'îmbrăcăminte de bază': 'basic clothing',
  'pantaloni bărbați': 'mens pants',
  'electronice': 'electronics',
  'accesorii frumusețe': 'beauty accessories',
  'pantaloni femei': 'womens pants',
  'modă': 'fashion',
  'maiouri': 'tank tops',
  'polo': 'polo shirts',
  'walkie talkies': 'walkie talkies',
  'telefoane mobile': 'mobile phones',
  'rochii': 'dresses',
  'șosete': 'socks',
  'hanorace': 'hoodies',
  'cămăși casual': 'casual shirts',
  'eșarfe': 'scarves',
  'ochelari de soare': 'sunglasses',
  'acoperitoare plajă': 'beach cover ups',
  'topuri & tricouri': 'tops and t-shirts',
  'hawaiian shirts': 'hawaiian shirts',
  'outerwear & coats': 'outerwear coats',
};

// Extrage "leaf" din categorie taxonomy "A > B > C > Leaf" → "Leaf"
function extractLeafCategory(fullCategory) {
  if (!fullCategory) return null;
  const parts = fullCategory.split('>').map(s => s.trim());
  return parts[parts.length - 1];
}

// Localize category pentru locale (RO păstrăm, EN traducem dacă există mapping)
function localizeCategory(leaf, locale) {
  if (!leaf) return null;
  if (locale === 'ro') return leaf;
  const key = leaf.toLowerCase();
  return CATEGORY_EN_MAP[key] || null; // skip if no translation
}

// ===== Commercial intent scorer =====
const INTENT_WORDS_RO = ['cele mai bune', 'top', 'recenzii', 'review', 'comparativ', 'pareri', 'recomandari', 'ghid', 'cumpara', '2026'];
const INTENT_WORDS_EN = ['best', 'top', 'review', 'reviews', 'vs', 'guide', 'comparison', 'buy', '2026', 'recommended'];

function scoreCommercialIntent(keyword, locale) {
  const lower = keyword.toLowerCase();
  const words = locale === 'ro' ? INTENT_WORDS_RO : INTENT_WORDS_EN;
  let score = 0;
  for (const w of words) {
    if (lower.includes(w)) score += 20;
  }
  return Math.min(100, score);
}

// ===== Google Autocomplete fetcher =====
async function fetchSuggestions(query, locale) {
  const gl = locale === 'ro' ? 'ro' : 'us';
  const hl = locale;
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[fetch] HTTP ${res.status} for "${query}"`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data[1]) ? data[1] : [];
  } catch (e) {
    console.warn(`[fetch] error "${query}": ${e.message}`);
    return [];
  }
}

// ===== Product supply scorer =====
async function scoreProductSupply(client, keyword) {
  // Folosim trigram search + active+safe filter
  const sql = `
    SELECT COUNT(*) as n
    FROM marketplace_products
    WHERE status='active'
      AND is_adult=false
      AND effective_label='safe'
      AND rating_numeric >= 4.5
      AND COALESCE(orders_count_int, 0) >= 50
      AND title ILIKE $1
    LIMIT 200
  `;
  const pattern = `%${keyword.toLowerCase().split(' ').slice(-2).join('%')}%`; // last 2 words
  try {
    const { rows } = await client.query(sql, [pattern]);
    const n = parseInt(rows[0]?.n || '0', 10);
    if (n === 0) return { score: 0, count: 0 };
    if (n <= 5) return { score: 20, count: n };
    if (n <= 20) return { score: 50, count: n };
    if (n <= 50) return { score: 75, count: n };
    return { score: 100, count: n };
  } catch (e) {
    console.warn(`[supply] query failed for "${keyword}": ${e.message}`);
    return { score: 0, count: 0 };
  }
}

// ===== Get quality categories =====
async function getQualityCategories(client, locale, limit = 30) {
  const sql = `
    SELECT category, COUNT(*) as n
    FROM marketplace_products
    WHERE status='active' AND is_adult=false AND effective_label='safe'
      AND rating_numeric >= 4.5 AND COALESCE(orders_count_int, 0) >= 50
      AND category IS NOT NULL
    GROUP BY category
    HAVING COUNT(*) >= 10
    ORDER BY COUNT(*) DESC
    LIMIT $1
  `;
  const { rows } = await client.query(sql, [limit]);
  return rows.map(r => {
    const leaf = extractLeafCategory(r.category);
    const localized = localizeCategory(leaf, locale);
    return { raw: r.category, leaf, localized, n: parseInt(r.n, 10) };
  }).filter(c => c.localized);
}

// ===== Composite score =====
function compositeScore(intent, position, supply) {
  // position 1 = bonus 10, position 10 = bonus 1
  const positionBonus = Math.max(1, 11 - (position || 10));
  return Math.round((intent * positionBonus * supply) / 100);
}

// ===== Main =====
async function run() {
  console.log(`[keyword-research] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} locales=${LOCALES.join(',')} max-queries=${MAX_QUERIES} rate-ms=${RATE_MS}`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL env not set. Export it before running.');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  const summary = {};

  for (const locale of LOCALES) {
    console.log(`\n=== locale=${locale} ===`);
    const categories = await getQualityCategories(client, locale, 30);
    console.log(`[${locale}] quality categories: ${categories.length}`);
    if (categories.length === 0) {
      console.log(`[${locale}] no localized categories — skip`);
      continue;
    }

    const seeds = SEEDS[locale];
    const queries = [];
    for (const seed of seeds) {
      for (const cat of categories) {
        queries.push({ seed, cat });
        if (queries.length >= MAX_QUERIES) break;
      }
      if (queries.length >= MAX_QUERIES) break;
    }
    console.log(`[${locale}] queries planned: ${queries.length}`);

    let newCount = 0;
    let updatedCount = 0;
    const topSuggestions = [];

    for (let i = 0; i < queries.length; i++) {
      const { seed, cat } = queries[i];
      const query = `${seed} ${cat.localized}`;
      const suggestions = await fetchSuggestions(query, locale);
      
      for (let pos = 0; pos < suggestions.length; pos++) {
        const keyword = suggestions[pos].trim();
        if (!keyword || keyword.length < 5 || keyword.length > 100) continue;
        
        const intent = scoreCommercialIntent(keyword, locale);
        if (intent === 0) continue; // skip non-commercial
        
        const { score: supply, count: matchedProducts } = await scoreProductSupply(client, keyword);
        if (supply === 0) continue; // skip if no products
        
        const composite = compositeScore(intent, pos + 1, supply);
        
        const upsert = `
          INSERT INTO blog_keyword_candidates 
            (keyword, locale, source, parent_category, seed_query, autocomplete_position,
             commercial_intent_score, product_supply_score, composite_score,
             matched_product_count, last_seen_at)
          VALUES ($1, $2, 'google_autocomplete', $3, $4, $5, $6, $7, $8, $9, now())
          ON CONFLICT (keyword, locale) DO UPDATE SET
            last_seen_at = now(),
            autocomplete_position = LEAST(blog_keyword_candidates.autocomplete_position, EXCLUDED.autocomplete_position),
            commercial_intent_score = EXCLUDED.commercial_intent_score,
            product_supply_score = EXCLUDED.product_supply_score,
            composite_score = EXCLUDED.composite_score,
            matched_product_count = EXCLUDED.matched_product_count
          RETURNING (xmax = 0) as inserted
        `;
        
        if (APPLY) {
          try {
            const { rows } = await client.query(upsert, [
              keyword, locale, cat.leaf, seed, pos + 1, intent, supply, composite, matchedProducts,
            ]);
            if (rows[0]?.inserted) newCount++; else updatedCount++;
          } catch (e) {
            console.warn(`[upsert] failed "${keyword}": ${e.message}`);
          }
        } else {
          newCount++; // dry-run: count as new
        }
        
        topSuggestions.push({ keyword, composite, intent, supply, matchedProducts, position: pos + 1 });
      }
      
      if (i < queries.length - 1) {
        await new Promise(r => setTimeout(r, RATE_MS));
      }
      if (i % 5 === 0) console.log(`  [${locale}] progress ${i + 1}/${queries.length}`);
    }
    
    topSuggestions.sort((a, b) => b.composite - a.composite);
    summary[locale] = { new: newCount, updated: updatedCount, top: topSuggestions.slice(0, 10) };
  }

  console.log('\n========== SUMMARY ==========');
  for (const [locale, s] of Object.entries(summary)) {
    console.log(`\n[${locale}] new=${s.new} updated=${s.updated}`);
    console.log(`  TOP 10:`);
    for (const t of s.top) {
      console.log(`    [${t.composite.toString().padStart(4)}] (pos ${t.position}, intent ${t.intent}, supply ${t.supply}, products ${t.matchedProducts}) "${t.keyword}"`);
    }
  }

  await client.end();
  console.log(`\n[done] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
}

run().catch(e => { console.error(e); process.exit(1); });
