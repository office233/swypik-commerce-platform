/**
 * eMAG Price Intelligence Scraper
 * Bazat pe ideea din github.com/adelinaenache/emag-scraper
 * Adaptat: Puppeteer → search eMAG → compară cu prețurile noastre
 * 
 * Usage:
 *   node scripts/emag-scraper.js "husa telefon"         ← search single
 *   node scripts/emag-scraper.js --batch 20             ← compare top 20 produse
 *   node scripts/emag-scraper.js --categories           ← compare pe categorii
 */

const puppeteer = require('puppeteer');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'aicevrei_products_cj',
  user: 'postgres', password: 'postgres',
});

const USD_TO_RON = 4.5;

// ─── OUR PRICING ─────────────────────────────────────────────
function ourPrice(costUsd, source = 'cj') {
  const cost = parseFloat(costUsd);
  const ship = source === 'cj' 
    ? (cost < 5 ? 3 : cost < 20 ? 5 : cost < 50 ? 8 : 10)
    : (cost < 5 ? 5 : cost < 20 ? 8 : cost < 50 ? 12 : 15);
  
  const totalRon = (cost + ship) * USD_TO_RON;
  let mk;
  if (totalRon < 30) mk = 3.5;
  else if (totalRon < 60) mk = 3.0;
  else if (totalRon < 120) mk = 2.8;
  else if (totalRon < 250) mk = 2.5;
  else mk = 2.2;

  const raw = totalRon * mk;
  const brackets = [49,69,79,99,129,149,199,249,299,399,499];
  const thresholds = [55,70,85,110,140,170,220,280,350,450,600];
  
  let sell = brackets[brackets.length - 1];
  for (let i = 0; i < thresholds.length; i++) {
    if (raw < thresholds[i]) { sell = brackets[i]; break; }
  }
  if (raw >= 600) sell = Math.ceil(raw / 100) * 100 - 1;
  
  return { costRon: Math.round(totalRon), sellRon: sell, markup: (sell / totalRon).toFixed(1) };
}

// ─── EMAG SCRAPER CLASS ──────────────────────────────────────
class EmagScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 900 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
    );
    // Block images for speed
    await this.page.setRequestInterception(true);
    this.page.on('request', req => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async searchProducts(query, maxResults = 5) {
    const searchUrl = `https://www.emag.ro/search/${encodeURIComponent(query)}`;
    
    try {
      await this.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await this.sleep(3000);

      // Accept cookies if popup appears
      try {
        const cookieBtn = await this.page.$('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
        if (cookieBtn) await cookieBtn.click();
        await this.sleep(1000);
      } catch(e) {}

      // Extract products — eMAG format: 
      // <p class="product-new-price">41<sup><small class="mf-decimal">,</small>99</sup> <span>Lei</span></p>
      const products = await this.page.evaluate((maxR) => {
        const cards = document.querySelectorAll('.card-item.js-product-data');
        const results = [];

        cards.forEach((card, i) => {
          if (i >= maxR) return;
          try {
            // Title: <a class="card-v2-title ...">text</a>
            const titleEl = card.querySelector('.card-v2-title');
            const priceEl = card.querySelector('.product-new-price');
            
            let title = titleEl ? titleEl.textContent.trim() : '';
            
            // Price: extract int part (direct text) + decimal (inside sup)
            let price = 0;
            if (priceEl) {
              const fullText = priceEl.textContent.replace(/\s+/g, ' ').trim();
              // Format: "41,99 Lei" or "9.999,99 Lei"
              const match = fullText.match(/([\d.]+),?(\d*)\s*Lei/);
              if (match) {
                const intPart = match[1].replace(/\./g, ''); // remove thousand separator
                const decPart = match[2] || '0';
                price = parseFloat(intPart + '.' + decPart);
              }
            }

            if (title && price > 0 && price < 50000) {
              results.push({ title: title.slice(0, 80), price });
            }
          } catch(e) {}
        });

        return results;
      }, maxResults);

      return {
        query,
        url: searchUrl,
        products,
        minPrice: products.length ? Math.min(...products.map(p => p.price)) : null,
        avgPrice: products.length ? products.reduce((s,p) => s + p.price, 0) / products.length : null,
        count: products.length,
      };
    } catch (err) {
      return { query, error: err.message, products: [], count: 0 };
    }
  }
}

// ─── SINGLE SEARCH ───────────────────────────────────────────
async function searchSingle(query) {
  const scraper = new EmagScraper();
  await scraper.init();
  
  console.log(`\n🔍 Searching eMAG: "${query}"`);
  const result = await scraper.searchProducts(query, 8);
  
  if (result.error) {
    console.log(`❌ Error: ${result.error}`);
  } else if (result.count === 0) {
    console.log('⚠️  No products found on eMAG');
  } else {
    console.log(`📊 Found ${result.count} products`);
    console.log(`💰 Min: ${result.minPrice?.toFixed(0)} RON | Avg: ${result.avgPrice?.toFixed(0)} RON\n`);
    
    for (const p of result.products) {
      console.log(`  ${p.price.toFixed(0).padStart(6)} RON | ${p.title}`);
    }
  }
  
  await scraper.close();
}

// ─── BATCH COMPARE ───────────────────────────────────────────
async function batchCompare(limit = 15) {
  const scraper = new EmagScraper();
  await scraper.init();
  
  // Get products from our DB  
  const { rows } = await pool.query(`
    SELECT title, cost_usd FROM products 
    WHERE pushed_to_shopify = true AND cost_usd > 0
    AND (LOWER(title) LIKE '%phone case%' OR LOWER(title) LIKE '%charger%'
    OR LOWER(title) LIKE '%bluetooth%' OR LOWER(title) LIKE '%watch%'
    OR LOWER(title) LIKE '%earphone%' OR LOWER(title) LIKE '%power bank%'
    OR LOWER(title) LIKE '%headphone%' OR LOWER(title) LIKE '%speaker%'
    OR LOWER(title) LIKE '%cable%' OR LOWER(title) LIKE '%lamp%'
    OR LOWER(title) LIKE '%led strip%' OR LOWER(title) LIKE '%ring light%')
    ORDER BY RANDOM() LIMIT $1
  `, [limit]);

  console.log('═'.repeat(90));
  console.log('  📊 COMPARAȚIE PREȚURI — AIcevrei vs eMAG (LIVE SCRAPE)');
  console.log('═'.repeat(90));
  console.log(`  ${'Produs'.padEnd(40)} ${'Cost'.padStart(5)} ${'Noi'.padStart(5)} ${'eMAG↓'.padStart(7)} ${'Diff'.padStart(7)} Status`);
  console.log('  ' + '─'.repeat(85));

  let cheaper = 0, expensive = 0, nodata = 0;

  for (const row of rows) {
    const our = ourPrice(row.cost_usd);
    const keywords = row.title.toLowerCase().split(' ').slice(0, 4).join(' ');
    
    const emag = await scraper.searchProducts(keywords, 5);
    await scraper.sleep(2000 + Math.random() * 3000); // Random delay

    const short = row.title.slice(0, 39);

    if (emag.minPrice) {
      const diff = our.sellRon - emag.minPrice;
      let status;
      if (diff < -5) { status = '✅ SUB eMAG'; cheaper++; }
      else if (diff <= 10) { status = '🟡 ~EGAL'; cheaper++; }
      else { status = '🔴 SCUMP'; expensive++; }

      console.log(`  ${short.padEnd(40)} ${our.costRon.toString().padStart(5)} ${our.sellRon.toString().padStart(5)} ${emag.minPrice.toFixed(0).padStart(7)} ${(diff > 0 ? '+' : '') + diff.toFixed(0).padStart(6)} ${status}`);
    } else {
      nodata++;
      console.log(`  ${short.padEnd(40)} ${our.costRon.toString().padStart(5)} ${our.sellRon.toString().padStart(5)} ${'N/A'.padStart(7)} ${'—'.padStart(7)} ⚪ N/A`);
    }
  }

  console.log('  ' + '─'.repeat(85));
  console.log(`\n  📊 REZULTAT: ✅ ${cheaper} sub/egal eMAG | 🔴 ${expensive} mai scumpi | ⚪ ${nodata} fără date`);
  console.log('═'.repeat(90));

  await scraper.close();
  await pool.end();
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--batch') {
    await batchCompare(parseInt(args[1] || '15'));
  } else if (args.length > 0) {
    await searchSingle(args.join(' '));
  } else {
    await batchCompare(10);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
