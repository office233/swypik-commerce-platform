#!/usr/bin/env node
/**
 * Padding-only fix pentru traducerile istorice cu seo_description < 140 chars.
 * Reutilizează padSeoDescription din translate-products-studiai.mjs (importat dinamic).
 *
 * Usage:
 *   DRY:   node scripts/pad-historical-seo.mjs --locale=ro --limit=100
 *   APPLY: node scripts/pad-historical-seo.mjs --locale=ro --limit=10000 --apply
 *
 * Env: DATABASE_URL
 */

import pg from 'pg';
const { Pool } = pg;

const SEO_MIN = 140;
const SEO_TARGET = 150;
const SEO_MAX = 165;
const SEO_PAD_PHRASES = {
  ro: [' Livrare rapidă.', ' Calitate premium.', ' Ideal pentru cadou.', ' Stoc limitat.'],
  en: [' Fast shipping.', ' Premium quality.', ' Great gift idea.', ' Limited stock.'],
  es: [' Envío rápido.', ' Calidad premium.', ' Ideal para regalo.', ' Stock limitado.'],
  fr: [' Livraison rapide.', ' Qualité premium.', ' Idéal cadeau.', ' Stock limité.'],
  de: [' Schneller Versand.', ' Premium-Qualität.', ' Ideal als Geschenk.', ' Begrenzt verfügbar.'],
  pt: [' Envio rápido.', ' Qualidade premium.', ' Ideal para presente.', ' Estoque limitado.'],
  it: [' Spedizione rapida.', ' Qualità premium.', ' Idea regalo.', ' Stock limitato.'],
};

function padSeoDescription(text, locale) {
  if (!text) return text;
  let s = String(text).trim();
  if (s.length >= SEO_MIN) return s.slice(0, SEO_MAX);
  const phrases = SEO_PAD_PHRASES[locale] || SEO_PAD_PHRASES.en;
  const sLow = s.toLowerCase();
  const used = new Set();
  for (const p of phrases) {
    if (s.length >= SEO_TARGET) break;
    if (s.length + p.length > SEO_MAX) continue;
    const key = p.trim().replace(/\.$/, '').toLowerCase();
    if (used.has(p) || sLow.includes(key)) continue;
    s = (s + p).trim();
    used.add(p);
  }
  return s.slice(0, SEO_MAX);
}

// Detectează dacă text e în locale-ul greșit (mismatch). Heuristic simplu:
//   - dacă target=en/es/de/fr/it/pt și textul are diacritice RO specifice (ăâîșț), e RO mismatched
//   - dacă target=ro și textul nu are NICIO literă din alfabet (ASCII pur lung), poate fi EN
function isLocaleMismatch(text, locale) {
  if (!text) return false;
  const hasRoDiacritics = /[ăâîșțĂÂÎȘȚ]/.test(text);
  if (locale !== 'ro' && hasRoDiacritics) return true;
  return false;
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.split('=');
  return [k.replace(/^-+/, ''), v ?? true];
}));
const LOCALE = args.locale;
const LIMIT = Number(args.limit || 100);
const APPLY = args.apply === true;
if (!LOCALE) { console.error('--locale=xx required'); process.exit(1); }

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  console.log(`[pad-historical] mode=${APPLY ? 'APPLY' : 'DRY'} locale=${LOCALE} limit=${LIMIT}`);

  const { rows } = await pool.query(
    `SELECT product_id, seo_description
     FROM product_translations
     WHERE locale = $1 AND length(seo_description) < $2 AND length(coalesce(seo_description,'')) > 0
     ORDER BY updated_at ASC
     LIMIT $3`,
    [LOCALE, SEO_MIN, LIMIT]
  );

  console.log(`[pad-historical] candidates=${rows.length}`);

  let padded = 0, skipped = 0, mismatch = 0, applied = 0;
  for (const r of rows) {
    const before = r.seo_description;
    if (isLocaleMismatch(before, LOCALE)) { mismatch++; continue; }
    const after = padSeoDescription(before, LOCALE);
    if (after.length === before.length) { skipped++; continue; }
    padded++;
    if (APPLY) {
      await pool.query(
        `UPDATE product_translations SET seo_description = $1, updated_at = now() WHERE product_id = $2 AND locale = $3`,
        [after, r.product_id, LOCALE]
      );
      applied++;
    } else if (padded <= 3) {
      console.log(`  sample: ${before.length} → ${after.length}: ${after.slice(0, 80)}...`);
    }
  }

  console.log(`[pad-historical] DONE total=${rows.length} padded=${padded} skipped_already_long=${skipped} skipped_mismatch=${mismatch} applied=${applied}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
