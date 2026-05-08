const crypto = require('crypto');
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

async function main() {
  console.log('⏳ Wait 3s...');
  await new Promise(r => setTimeout(r, 3000));

  // All params in JSON
  const freight = await callAPI('aliexpress.ds.freight.query', {
    queryDeliveryReq: JSON.stringify({
      productId: '1005009497174010',
      selectedSkuId: '12000049283394673',
      shipToCountry: 'RO',
      country: 'RO',
      locale: 'en_US',
      quantity: 1,
      currency: 'USD',
      language: 'en',
    }),
  });

  console.log('🚚 Test 1 (all in JSON):');
  console.log(JSON.stringify(freight, null, 2).slice(0, 2000));

  await new Promise(r => setTimeout(r, 2000));

  // Try with top-level + json
  const freight2 = await callAPI('aliexpress.ds.freight.query', {
    locale: 'en_US',
    shipToCountry: 'RO',
    queryDeliveryReq: JSON.stringify({
      productId: '1005009497174010',
      selectedSkuId: '12000049283394673',
      shipToCountry: 'RO',
      locale: 'en_US',
      quantity: 1,
      currency: 'USD',
    }),
  });

  console.log('\n🚚 Test 2 (top + JSON):');
  console.log(JSON.stringify(freight2, null, 2).slice(0, 2000));
}

main();
