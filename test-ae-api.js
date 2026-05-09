const crypto = require('crypto');
const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';

function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  return crypto.createHmac('sha256', APP_SECRET).update(sorted.map(k => k + params[k]).join('')).digest('hex').toUpperCase();
}

async function testAPI(productId) {
  const params = { 
    app_key: APP_KEY, 
    method: 'aliexpress.ds.product.get', 
    sign_method: 'sha256', 
    timestamp: Date.now().toString(), 
    format: 'json', 
    v: '2.0', 
    session: TOKEN,
    product_id: productId, 
    target_currency: 'USD', 
    target_language: 'EN',
    ship_to_country: 'RO', 
    country: 'RO',
  };
  params.sign = sign(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('&');
  const res = await fetch('https://api-sg.aliexpress.com/sync?' + qs);
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

testAPI('1005010711164257').catch(console.error);
