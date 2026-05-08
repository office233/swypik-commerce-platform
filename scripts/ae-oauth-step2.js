/**
 * AliExpress OAuth — FINAL version — try all sign methods
 */
const crypto = require('crypto');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const AUTH_CODE = '3_533768_ehid5c5s7pOUntnoPZagWieq2643';

// Sign method 1: HMAC-SHA256 with secret+params+secret
function signV1(params) {
  const sorted = Object.keys(params).sort();
  let str = APP_SECRET;
  for (const key of sorted) str += key + params[key];
  str += APP_SECRET;
  return crypto.createHmac('sha256', APP_SECRET).update(str, 'utf8').digest('hex').toUpperCase();
}

// Sign method 2: HMAC-SHA256 without wrapping secret
function signV2(params) {
  const sorted = Object.keys(params).sort();
  let str = '';
  for (const key of sorted) str += key + params[key];
  return crypto.createHmac('sha256', APP_SECRET).update(str, 'utf8').digest('hex').toUpperCase();
}

// Sign method 3: path prefix + sorted params
function signV3(params, path) {
  const sorted = Object.keys(params).sort();
  let str = path;
  for (const key of sorted) str += key + params[key];
  return crypto.createHmac('sha256', APP_SECRET).update(str, 'utf8').digest('hex').toUpperCase();
}

async function tryAll() {
  console.log('🔐 Trying all sign methods...\n');

  const baseParams = {
    app_key: APP_KEY,
    sign_method: 'sha256',
    timestamp: Date.now().toString(),
    code: AUTH_CODE,
  };

  const signMethods = [
    { name: 'V1: secret+params+secret', fn: (p) => signV1(p) },
    { name: 'V2: HMAC only params', fn: (p) => signV2(p) },
    { name: 'V3: path+params', fn: (p) => signV3(p, '/auth/token/create') },
  ];

  for (const method of signMethods) {
    const params = { ...baseParams, timestamp: Date.now().toString() };
    params.sign = method.fn(params);
    
    const body = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    
    console.log(`--- ${method.name} ---`);
    
    try {
      const res = await fetch('https://api-sg.aliexpress.com/rest/auth/token/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const data = await res.json();
      
      if (data.access_token) {
        console.log('✅ SUCCESS!');
        console.log('  access_token:', data.access_token);
        console.log('  refresh_token:', data.refresh_token);
        console.log('\nALIEXPRESS_ACCESS_TOKEN=' + data.access_token);
        console.log('ALIEXPRESS_REFRESH_TOKEN=' + data.refresh_token);
        return data;
      }
      console.log('❌', data.code || data.message, '\n');
    } catch (e) {
      console.log('❌ Error:', e.message, '\n');
    }
  }

  // Also try as GET params on URL
  console.log('--- GET method ---');
  const params = { ...baseParams, timestamp: Date.now().toString() };
  params.sign = signV1(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  
  try {
    const res = await fetch('https://api-sg.aliexpress.com/rest/auth/token/create?' + qs);
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text.slice(0, 400));
    try {
      const data = JSON.parse(text);
      if (data.access_token) {
        console.log('\n✅ SUCCESS!');
        console.log('ALIEXPRESS_ACCESS_TOKEN=' + data.access_token);
        console.log('ALIEXPRESS_REFRESH_TOKEN=' + data.refresh_token);
        return data;
      }
    } catch {}
  } catch(e) { console.log('Error:', e.message); }

  // Try /sync endpoint with method=auth.token.create
  console.log('\n--- /sync with aliexpress.system.oauth.token ---');
  const syncParams = {
    app_key: APP_KEY,
    method: 'aliexpress.system.oauth.token',
    sign_method: 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    code: AUTH_CODE,
    grant_type: 'authorization_code',
  };
  syncParams.sign = signV1(syncParams);
  const syncQs = Object.entries(syncParams).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  
  try {
    const res = await fetch('https://api-sg.aliexpress.com/sync?' + syncQs);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data).slice(0, 400));
    if (data.access_token) {
      console.log('\n✅ SUCCESS!');
      return data;
    }
  } catch(e) { console.log('Error:', e.message); }

  console.log('\n⚠️  All methods failed');
}

tryAll().catch(e => console.error('FATAL:', e.message));
