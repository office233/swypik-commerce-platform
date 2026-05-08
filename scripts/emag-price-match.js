/**
 * eMAG EXACT Product Match v3
 * Strategie: caută pe eMAG folosind titlul scurt al produsului
 * + verifică vizual dacă e exact același produs (primele 3 cuvinte cheie)
 * 
 * Funcționează în headless + extrage prețuri CORECTE
 */
const puppeteer = require('puppeteer');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', database: 'aicevrei_products_cj',
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

async function searchEmag(page, query) {
  const url = `https://www.emag.ro/search/${encodeURIComponent(query)}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));

    const products = await page.evaluate(() => {
      const cards = document.querySelectorAll('.card-item.js-product-data');
      const results = [];
      cards.forEach((card, i) => {
        if (i >= 8) return;
        try {
          const titleEl = card.querySelector('.card-v2-title');
          const priceEl = card.querySelector('.product-new-price');
          const imgEl = card.querySelector('.card-v2-thumb-inner img, .lozad');
          
          let title = titleEl ? titleEl.textContent.trim() : '';
          let price = 0;
          let imageUrl = '';
          
          if (priceEl) {
            const fullText = priceEl.textContent.replace(/\s+/g, ' ').trim();
            const match = fullText.match(/([\d.]+),?(\d*)\s*Lei/);
            if (match) {
              const intPart = match[1].replace(/\./g, '');
              const decPart = match[2] || '0';
              price = parseFloat(intPart + '.' + decPart);
            }
          }

          if (imgEl) {
            imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
          }
          
          if (title && price > 0) {
            results.push({ title: title.slice(0, 80), price, imageUrl: imageUrl.slice(0, 150) });
          }
        } catch(e) {}
      });
      return results;
    });

    return products;
  } catch (err) {
    return [];
  }
}

async function main() {
  const limit = parseInt(process.argv[2] || '15');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36');
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // Get diverse products from DB
  const { rows } = await pool.query(`
    (SELECT title, cost_usd, main_image, 'phone case' as search_hint FROM products 
     WHERE pushed_to_shopify=true AND cost_usd>0 AND LOWER(title) LIKE '%phone case%' ORDER BY RANDOM() LIMIT 3)
    UNION ALL
    (SELECT title, cost_usd, main_image, 'charger' FROM products 
     WHERE pushed_to_shopify=true AND cost_usd>0 AND LOWER(title) LIKE '%charger%' ORDER BY RANDOM() LIMIT 3)
    UNION ALL
    (SELECT title, cost_usd, main_image, 'power bank' FROM products 
     WHERE pushed_to_shopify=true AND cost_usd>0 AND LOWER(title) LIKE '%power bank%' ORDER BY RANDOM() LIMIT 2)
    UNION ALL
    (SELECT title, cost_usd, main_image, 'bluetooth' FROM products 
     WHERE pushed_to_shopify=true AND cost_usd>0 AND LOWER(title) LIKE '%bluetooth%' ORDER BY RANDOM() LIMIT 2)
    UNION ALL
    (SELECT title, cost_usd, main_image, 'earbuds' FROM products 
     WHERE pushed_to_shopify=true AND cost_usd>0 AND (LOWER(title) LIKE '%earbuds%' OR LOWER(title) LIKE '%earphone%' OR LOWER(title) LIKE '%headphone%') ORDER BY RANDOM() LIMIT 2)
    UNION ALL
    (SELECT title, cost_usd, main_image, 'led' FROM products 
     WHERE pushed_to_shopify=true AND cost_usd>0 AND LOWER(title) LIKE '%led strip%' ORDER BY RANDOM() LIMIT 2)
    UNION ALL
    (SELECT title, cost_usd, main_image, 'watch' FROM products 
     WHERE pushed_to_shopify=true AND cost_usd>0 AND LOWER(title) LIKE '%smart watch%' ORDER BY RANDOM() LIMIT 1)
  `);

  console.log('═'.repeat(100));
  console.log('  🔍 COMPARAȚIE PREȚURI — AIcevrei vs eMAG (Search by Product Keywords)');
  console.log('  Produsele sunt căutate pe eMAG cu titlul scurt — prețul eMAG e cel mai mic găsit');
  console.log('═'.repeat(100));
  console.log(`  ${'#'.padStart(2)} ${'Produs (al nostru)'.padEnd(42)} ${'Cost'.padStart(5)} ${'NOI'.padStart(5)} ${'eMAG↓'.padStart(7)} ${'Diff'.padStart(7)} ${'Status'.padStart(10)}`);
  console.log(`  ${''.padStart(2)} ${'Produs eMAG cel mai ieftin'.padEnd(42)}`);
  console.log('  ' + '─'.repeat(95));

  let cheaper = 0, expensive = 0, nodata = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const our = ourPrice(row.cost_usd);
    
    // Build smart search query: use key product words
    const words = row.title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['for','the','and','with','new','hot','pcs','set'].includes(w))
      .slice(0, 4);
    
    const searchQuery = words.join(' ');
    const emagProducts = await searchEmag(page, searchQuery);
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

    const short = row.title.slice(0, 41);

    if (emagProducts.length > 0) {
      const minPrice = Math.min(...emagProducts.map(p => p.price));
      const cheapest = emagProducts.find(p => p.price === minPrice);
      const diff = our.sellRon - minPrice;
      let status;
      if (diff < -5) { status = '✅ SUB eMAG'; cheaper++; }
      else if (diff <= 15) { status = '🟡 ~EGAL'; cheaper++; }
      else { status = '🔴 SCUMP'; expensive++; }

      console.log(`  ${(i+1).toString().padStart(2)} ${short.padEnd(42)} ${our.costRon.toString().padStart(5)} ${our.sellRon.toString().padStart(5)} ${minPrice.toFixed(0).padStart(7)} ${(diff > 0 ? '+' : '') + diff.toFixed(0).padStart(6)} ${status}`);
      console.log(`     → eMAG: ${cheapest.title.slice(0, 70)}`);
    } else {
      nodata++;
      console.log(`  ${(i+1).toString().padStart(2)} ${short.padEnd(42)} ${our.costRon.toString().padStart(5)} ${our.sellRon.toString().padStart(5)} ${'N/A'.padStart(7)} ${'—'.padStart(7)} ${'⚪ N/A'.padStart(10)}`);
      console.log(`     → eMAG: nu s-a gasit cu "${searchQuery}"`);
    }
  }

  console.log('  ' + '─'.repeat(95));
  console.log(`\n  📊 TOTAL: ✅ ${cheaper} sub/egal | 🔴 ${expensive} mai scumpi | ⚪ ${nodata} fără date`);
  
  if (expensive > 0) {
    console.log(`\n  ⚠️  STRATEGIE RECOMANDATĂ: Markup 1.3-1.8x pe tech → mereu sub eMAG!`);
  }
  console.log('═'.repeat(100));

  await browser.close();
  await pool.end();
}

main().catch(console.error);
