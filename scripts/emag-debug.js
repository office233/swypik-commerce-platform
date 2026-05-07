/**
 * eMAG Price Intelligence v2 — Debug mode
 * Saves full HTML to analyze selectors
 */
const puppeteer = require('puppeteer');
const fs = require('fs');

async function run() {
  const browser = await puppeteer.launch({
    headless: false, // Show browser to debug
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
  );

  console.log('Opening eMAG search...');
  await page.goto('https://www.emag.ro/search/husa+telefon+silicon', {
    waitUntil: 'networkidle2',
    timeout: 20000,
  });

  // Wait for content to load
  await new Promise(r => setTimeout(r, 3000));

  // Try to accept cookies
  try {
    const frames = page.frames();
    for (const frame of frames) {
      const btn = await frame.$('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
      if (btn) { await btn.click(); console.log('Accepted cookies'); break; }
    }
  } catch(e) {}

  await new Promise(r => setTimeout(r, 2000));

  // Save HTML for analysis
  const html = await page.content();
  fs.writeFileSync('d:/Aicevrei/emag-debug.html', html);
  console.log(`Saved HTML (${(html.length/1024).toFixed(0)} KB)`);

  // Try multiple selector strategies
  const selectors = [
    '.card-item',
    '.card-standard', 
    '[data-name]',
    '.card-v2',
    '.product-list-item',
    '.card',
    '#card_grid .card-item',
    '.card-item[data-name]',
    '.js-product-data',
  ];

  for (const sel of selectors) {
    const count = await page.$$eval(sel, els => els.length).catch(() => 0);
    if (count > 0) console.log(`  ✅ ${sel} → ${count} elements`);
  }

  // Try to get prices with broader approach
  const data = await page.evaluate(() => {
    const results = [];
    
    // Strategy 1: card-item with data attributes
    document.querySelectorAll('[data-name]').forEach(el => {
      results.push({
        tag: el.tagName,
        name: el.getAttribute('data-name'),
        price: el.getAttribute('data-price'),
        classes: el.className.slice(0, 50),
      });
    });

    // Strategy 2: product-new-price
    document.querySelectorAll('.product-new-price').forEach(el => {
      results.push({
        tag: 'PRICE',
        text: el.textContent.trim().slice(0, 30),
        classes: el.className,
      });
    });

    // Strategy 3: any element with Lei in text
    const allText = document.body.innerText;
    const priceMatches = allText.match(/\d+[\s,]\d+\s*Lei/g);
    if (priceMatches) {
      results.push({ tag: 'TEXT_MATCH', prices: priceMatches.slice(0, 10) });
    }

    return results;
  });

  console.log(`\nFound ${data.length} data points:`);
  for (const d of data.slice(0, 15)) {
    console.log(`  ${JSON.stringify(d)}`);
  }

  await browser.close();
}

run().catch(console.error);
