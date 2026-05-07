/**
 * eMAG Image Match v2 — Google Shopping reverse search
 * Deschide browser vizibil pentru a evita blocarea
 */
const puppeteer = require('puppeteer');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'localhost', database: 'aicevrei_products_cj',
  user: 'postgres', password: 'postgres',
});

async function findByImage(imageUrl) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--lang=ro-RO'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
  );

  console.log('\n🔍 Step 1: Google Lens reverse search...');
  
  // Go to Google Images
  await page.goto('https://images.google.com', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Accept cookies
  try {
    const btns = await page.$$('button');
    for (const btn of btns) {
      const text = await btn.evaluate(el => el.textContent);
      if (text.includes('Accept') || text.includes('Acceptă') || text.includes('agree')) {
        await btn.click();
        await new Promise(r => setTimeout(r, 1000));
        break;
      }
    }
  } catch(e) {}

  // Click camera icon for image search
  try {
    const cameraBtn = await page.$('[aria-label="Search by image"], .Gdd5U, .tdAJAf');
    if (cameraBtn) {
      await cameraBtn.click();
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch(e) {
    console.log('Camera button not found, trying direct URL...');
  }

  // Try paste URL approach
  try {
    // Click "Paste image link" tab
    const tabs = await page.$$('[role="tab"], .aXBaX, .WCkOo');
    for (const tab of tabs) {
      const text = await tab.evaluate(el => el.textContent);
      if (text.includes('link') || text.includes('URL') || text.includes('Paste')) {
        await tab.click();
        await new Promise(r => setTimeout(r, 500));
        break;
      }
    }

    // Type the image URL
    const input = await page.$('input[type="text"], input[placeholder*="Paste"], .cB9M7');
    if (input) {
      await input.type(imageUrl, { delay: 30 });
      await new Promise(r => setTimeout(r, 500));
      
      // Click search
      const searchBtn = await page.$('[type="submit"], .Qwbd3, .lsb-search');
      if (searchBtn) await searchBtn.click();
    }
  } catch(e) {
    console.log('Paste URL failed, trying direct navigation...');
  }

  // Fallback: direct Google Lens URL
  await new Promise(r => setTimeout(r, 2000));
  const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}&hl=ro`;
  await page.goto(lensUrl, { waitUntil: 'networkidle2', timeout: 25000 });
  await new Promise(r => setTimeout(r, 5000));

  console.log('🔍 Step 2: Extracting results...');

  // Save page for analysis
  const html = await page.content();
  fs.writeFileSync('d:/Aicevrei/lens-debug.html', html);
  console.log(`   Saved HTML (${(html.length/1024).toFixed(0)} KB)`);

  // Try to find shopping results
  const results = await page.evaluate(() => {
    const items = [];
    
    // Strategy 1: Look for price elements
    const allElements = document.querySelectorAll('*');
    const priceRegex = /(\d+[\s,.]?\d*)\s*(Lei|RON|lei|ron)/;
    
    for (const el of allElements) {
      if (el.children.length > 3) continue; // skip containers
      const text = el.textContent.trim();
      if (text.length > 200) continue;
      
      const match = text.match(priceRegex);
      if (match) {
        const price = parseFloat(match[1].replace(/\s/g, '').replace('.', '').replace(',', '.'));
        if (price > 0 && price < 50000) {
          // Check if emag link nearby
          const parent = el.closest('a') || el.parentElement.closest('a');
          const href = parent ? parent.href : '';
          const isEmag = href.includes('emag.ro');
          
          items.push({
            text: text.slice(0, 100),
            price,
            url: href.slice(0, 100),
            isEmag,
          });
        }
      }
    }

    // Strategy 2: Look for specific shopping results
    document.querySelectorAll('a[href*="emag.ro"]').forEach(link => {
      const container = link.closest('div');
      if (container) {
        const text = container.textContent;
        const match = text.match(/(\d+[\s,.]?\d*)\s*(Lei|RON)/i);
        if (match) {
          const price = parseFloat(match[1].replace(/\s/g, '').replace('.', '').replace(',', '.'));
          items.push({
            text: link.textContent.trim().slice(0, 100),
            price,
            url: link.href.slice(0, 100),
            isEmag: true,
          });
        }
      }
    });

    return items;
  });

  // Separate eMAG vs other results
  const emagResults = results.filter(r => r.isEmag);
  const otherResults = results.filter(r => !r.isEmag && r.price > 0);

  console.log(`\n📊 REZULTATE:`);
  
  if (emagResults.length > 0) {
    console.log(`\n  🛒 eMAG (${emagResults.length} results):`);
    emagResults.forEach(r => {
      console.log(`    ${r.price.toFixed(0).padStart(6)} RON | ${r.text.slice(0, 60)}`);
    });
    const minEmag = Math.min(...emagResults.map(r => r.price));
    console.log(`  → MIN eMAG: ${minEmag.toFixed(0)} RON`);
  } else {
    console.log('  ⚠️  Nu s-a găsit pe eMAG');
  }

  if (otherResults.length > 0) {
    console.log(`\n  🌐 Alte site-uri (${otherResults.length} results):`);
    otherResults.slice(0, 5).forEach(r => {
      console.log(`    ${r.price.toFixed(0).padStart(6)} RON | ${r.text.slice(0, 60)}`);
    });
  }

  // Keep browser open 10s for manual inspection
  console.log('\n⏳ Browser rămâne deschis 10s pentru verificare...');
  await new Promise(r => setTimeout(r, 10000));
  
  await browser.close();
  await pool.end();
}

// MAIN
const imageUrl = process.argv[2] || 'https://cf.cjdropshipping.com/fce979e0-afea-4031-aa34-6d677c46cecf.jpg';
findByImage(imageUrl).catch(console.error);
