/**
 * eMAG Price Match by IMAGE — Google Lens Reverse Image Search
 * Caută exact același produs pe eMAG folosind poza noastră
 * 
 * Flow: Product Image → Google Lens → filtrează emag.ro → preț
 * 
 * Usage:
 *   node scripts/emag-image-match.js                    ← batch 10 produse
 *   node scripts/emag-image-match.js --limit 5          ← batch 5 produse
 *   node scripts/emag-image-match.js --url "https://..."← un singur URL imagine
 */

const puppeteer = require('puppeteer');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'aicevrei_products_cj',
  user: 'postgres', password: 'postgres',
});

const USD_TO_RON = 4.5;

function ourPrice(costUsd) {
  const cost = parseFloat(costUsd);
  const ship = cost < 5 ? 3 : cost < 20 ? 5 : cost < 50 ? 8 : 10;
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
  let sell = 499;
  for (let i = 0; i < thresholds.length; i++) {
    if (raw < thresholds[i]) { sell = brackets[i]; break; }
  }
  return { costRon: Math.round(totalRon), sellRon: sell };
}

class ImageMatcher {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
             '--lang=ro-RO'],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 900 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
    );
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * Search Google Lens with an image URL, find eMAG listings
   */
  async findOnEmag(imageUrl) {
    try {
      // Google Lens reverse image search
      const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
      
      await this.page.goto(lensUrl, { waitUntil: 'networkidle2', timeout: 25000 });
      await this.sleep(3000);

      // Accept Google cookies if needed
      try {
        const acceptBtn = await this.page.$('button[id="L2AGLb"], [aria-label="Accept all"]');
        if (acceptBtn) { await acceptBtn.click(); await this.sleep(1500); }
      } catch(e) {}

      await this.sleep(2000);

      // Extract all shopping/product results
      const results = await this.page.evaluate(() => {
        const items = [];
        
        // Google Lens shows product matches with prices
        // Look for links containing emag.ro
        const allLinks = document.querySelectorAll('a[href]');
        
        allLinks.forEach(link => {
          const href = link.href || '';
          const text = link.textContent || '';
          
          // Check if it's an eMAG link
          if (href.includes('emag.ro') || text.toLowerCase().includes('emag')) {
            // Try to find price nearby
            const parent = link.closest('[data-action-url], [data-docid], div');
            let price = 0;
            let title = '';
            
            if (parent) {
              const priceText = parent.textContent;
              // Match Romanian price format: "XX,XX lei" or "XX lei"
              const priceMatch = priceText.match(/([\d.]+),?(\d*)\s*(?:lei|RON|Ron)/i);
              if (priceMatch) {
                const intPart = priceMatch[1].replace(/\./g, '');
                const decPart = priceMatch[2] || '0';
                price = parseFloat(intPart + '.' + decPart);
              }
              title = text.trim().slice(0, 80);
            }

            if (price > 0 && price < 50000) {
              items.push({ title, price, url: href.slice(0, 120), source: 'emag' });
            }
          }
        });

        // Also get ALL product matches with prices (not just eMAG)
        const allResults = [];
        document.querySelectorAll('[data-action-url], [data-docid]').forEach(el => {
          const text = el.textContent || '';
          const priceMatch = text.match(/([\d.]+),?(\d*)\s*(?:lei|RON|Ron)/i);
          if (priceMatch) {
            const intPart = priceMatch[1].replace(/\./g, '');
            const decPart = priceMatch[2] || '0';
            const price = parseFloat(intPart + '.' + decPart);
            if (price > 0 && price < 50000) {
              const link = el.querySelector('a');
              const url = link ? link.href : '';
              const isEmag = url.includes('emag.ro');
              allResults.push({
                title: text.trim().slice(0, 80),
                price,
                url: url.slice(0, 120),
                source: isEmag ? 'emag' : 'other',
              });
            }
          }
        });

        return { emagResults: items, allResults: allResults.slice(0, 10) };
      });

      // Get current URL for debugging
      const currentUrl = this.page.url();

      return {
        imageUrl,
        emagMatches: results.emagResults,
        allMatches: results.allResults,
        emagMinPrice: results.emagResults.length 
          ? Math.min(...results.emagResults.map(r => r.price)) 
          : null,
        totalFound: results.emagResults.length,
        lensUrl: currentUrl,
      };

    } catch (err) {
      return { imageUrl, error: err.message, emagMatches: [], allMatches: [], totalFound: 0 };
    }
  }
}

// ─── BATCH COMPARE ───────────────────────────────────────────
async function batchCompare(limit = 10) {
  const matcher = new ImageMatcher();
  await matcher.init();
  
  const { rows } = await pool.query(`
    SELECT id, title, cost_usd, main_image FROM products 
    WHERE pushed_to_shopify = true AND cost_usd > 0 
    AND main_image IS NOT NULL AND main_image LIKE 'http%'
    ORDER BY RANDOM() LIMIT $1
  `, [limit]);

  console.log('═'.repeat(95));
  console.log('  🔍 IMAGE MATCH — AIcevrei vs eMAG (Google Lens Reverse Search)');
  console.log('═'.repeat(95));
  console.log(`  ${'Produs'.padEnd(40)} ${'Cost'.padStart(5)} ${'Noi'.padStart(5)} ${'eMAG'.padStart(7)} ${'Diff'.padStart(7)} Status`);
  console.log('  ' + '─'.repeat(88));

  let cheaper = 0, expensive = 0, nodata = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const our = ourPrice(row.cost_usd);
    
    const result = await matcher.findOnEmag(row.main_image);
    await matcher.sleep(3000 + Math.random() * 2000);

    const short = row.title.slice(0, 39);

    if (result.emagMinPrice) {
      const diff = our.sellRon - result.emagMinPrice;
      let status;
      if (diff < -5) { status = '✅ SUB eMAG'; cheaper++; }
      else if (diff <= 10) { status = '🟡 ~EGAL'; cheaper++; }
      else { status = '🔴 SCUMP'; expensive++; }

      console.log(`  [${i+1}/${rows.length}] ${short.padEnd(37)} ${our.costRon.toString().padStart(5)} ${our.sellRon.toString().padStart(5)} ${result.emagMinPrice.toFixed(0).padStart(7)} ${(diff > 0 ? '+' : '') + diff.toFixed(0).padStart(6)} ${status}`);
      
      if (result.emagMatches.length > 0) {
        console.log(`         eMAG: ${result.emagMatches[0].title.slice(0, 60)}`);
      }
    } else {
      nodata++;
      // Show other results if available
      const otherPrices = result.allMatches.filter(m => m.price > 0);
      const extra = otherPrices.length ? ` (alte site-uri: ${otherPrices.map(p => p.price.toFixed(0)).join(', ')} RON)` : '';
      console.log(`  [${i+1}/${rows.length}] ${short.padEnd(37)} ${our.costRon.toString().padStart(5)} ${our.sellRon.toString().padStart(5)} ${'N/A'.padStart(7)} ${'—'.padStart(7)} ⚪ N/A${extra}`);
    }
  }

  console.log('  ' + '─'.repeat(88));
  console.log(`\n  📊 REZULTAT: ✅ ${cheaper} sub/egal eMAG | 🔴 ${expensive} mai scumpi | ⚪ ${nodata} fără date eMAG`);
  console.log('═'.repeat(95));

  await matcher.close();
  await pool.end();
}

// ─── SINGLE URL ──────────────────────────────────────────────
async function searchSingleImage(imageUrl) {
  const matcher = new ImageMatcher();
  await matcher.init();

  console.log(`\n🔍 Searching by image: ${imageUrl.slice(0, 60)}...`);
  const result = await matcher.findOnEmag(imageUrl);

  if (result.error) {
    console.log(`❌ Error: ${result.error}`);
  } else {
    console.log(`📊 eMAG matches: ${result.totalFound}`);
    if (result.emagMinPrice) {
      console.log(`💰 eMAG min price: ${result.emagMinPrice.toFixed(0)} RON`);
    }
    for (const m of result.emagMatches) {
      console.log(`  ${m.price.toFixed(0).padStart(6)} RON | ${m.title} | ${m.url.slice(0, 50)}`);
    }
    if (result.allMatches.length > 0) {
      console.log(`\nAlte site-uri:`);
      for (const m of result.allMatches.slice(0, 5)) {
        console.log(`  ${m.price.toFixed(0).padStart(6)} RON | ${m.source} | ${m.title.slice(0, 50)}`);
      }
    }
  }

  await matcher.close();
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--url' && args[1]) {
    await searchSingleImage(args[1]);
  } else {
    const limit = args[0] === '--limit' ? parseInt(args[1] || '10') : 10;
    await batchCompare(limit);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
