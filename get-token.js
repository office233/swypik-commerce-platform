const crypto = require('crypto');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const CODE = '3_533768_aIi5Zi6qGn4sFXOCfTfr1GX12820';

async function getToken() {
  const params = {
    app_key: APP_KEY,
    sign_method: 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    code: CODE,
    grant_type: 'authorization_code',
    sp: 'ds'
  };

  const sorted = Object.keys(params).sort();
  // For REST APIs, the path is prepended to the signature string
  const signStr = '/auth/token/create' + sorted.map(k => k + params[k]).join('');
  params.sign = crypto.createHmac('sha256', APP_SECRET).update(signStr).digest('hex').toUpperCase();

  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  
  const res = await fetch('https://api-sg.aliexpress.com/rest/auth/token/create?' + qs, {
    method: 'POST'
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

getToken().catch(console.error);
