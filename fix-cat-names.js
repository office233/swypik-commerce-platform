const { Client } = require('pg');
const crypto = require('crypto');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';

function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  return crypto.createHmac('sha256', APP_SECRET).update(sorted.map(k => k + params[k]).join('')).digest('hex').toUpperCase();
}

async function callAPI(method, extra = {}) {
  const params = { app_key: APP_KEY, method, sign_method: 'sha256', timestamp: Date.now().toString(), format: 'json', v: '2.0', session: TOKEN, ...extra };
  params.sign = sign(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
  return (await fetch('https://api-sg.aliexpress.com/sync?' + qs)).json();
}

async function fixNames() {
  const c = new Client(NEON_URL);
  await c.connect();

  const { rows } = await c.query("SELECT ae_category_id, name FROM ae_categories WHERE name LIKE 'Sub %'");
  console.log(`Găsite ${rows.length} categorii de tradus...`);

  for (const row of rows) {
    const cid = row.ae_category_id;
    try {
      // Incearcă să ia numele din API
      const res = await callAPI('aliexpress.ds.category.get', { category_id: cid });
      const cat = res.aliexpress_ds_category_get_response?.result?.categories?.category?.[0];
      if (cat && cat.category_name) {
        let enName = cat.category_name;
        // Punem un mic map manual pentru română pe viitor, deocamdată măcar să fie engleză clară
        await c.query('UPDATE ae_categories SET name = $1, name_ro = $1 WHERE ae_category_id = $2', [enName, cid]);
        console.log(`✅ Corectat: [${cid}] -> ${enName}`);
      } else {
        console.log(`❌ Eșuat pentru: [${cid}] - nu a returnat nume`);
      }
    } catch(e) {
      console.log(`Eroare la ${cid}: ${e.message}`);
    }
  }

  await c.end();
}

fixNames().catch(console.error);
