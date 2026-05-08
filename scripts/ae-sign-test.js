/**
 * Find the correct sign method for /sync endpoint
 */
const crypto = require('crypto');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';

// All possible sign methods
function signMethods(params, methodPath) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  
  // Build base string variants
  const kvStr = sorted.map(k => k + params[k]).join('');
  const pathClean = '/' + methodPath.replaceAll('.', '/');
  
  return {
    // Method A: secret + params + secret (standard TOP)
    A: crypto.createHmac('sha256', APP_SECRET).update(APP_SECRET + kvStr + APP_SECRET).digest('hex').toUpperCase(),
    // Method B: just params
    B: crypto.createHmac('sha256', APP_SECRET).update(kvStr).digest('hex').toUpperCase(),
    // Method C: path + params
    C: crypto.createHmac('sha256', APP_SECRET).update(pathClean + kvStr).digest('hex').toUpperCase(),
    // Method D: path + params + secret
    D: crypto.createHmac('sha256', APP_SECRET).update(pathClean + kvStr + APP_SECRET).digest('hex').toUpperCase(),
    // Method E: md5 instead
    E: crypto.createHmac('md5', APP_SECRET).update(APP_SECRET + kvStr + APP_SECRET).digest('hex').toUpperCase(),
    // Method F: hmac-md5 just params
    F: crypto.createHmac('md5', APP_SECRET).update(kvStr).digest('hex').toUpperCase(),
  };
}

async function test() {
  const method = 'aliexpress.ds.recommend.feed.get';
  
  const baseParams = {
    app_key: APP_KEY,
    method: method,
    sign_method: 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    session: TOKEN,
    country: 'RO',
    target_currency: 'USD',
    target_language: 'EN',
    feed_name: 'DS center',
    page_no: '1',
    page_size: '3',
  };

  const signs = signMethods(baseParams, method);
  
  for (const [name, sig] of Object.entries(signs)) {
    // Fresh timestamp for each
    baseParams.timestamp = Date.now().toString();
    const freshSigns = signMethods(baseParams, method);
    baseParams.sign = freshSigns[name];
    
    const qs = Object.entries(baseParams).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const url = 'https://api-sg.aliexpress.com/sync?' + qs;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.error_response?.code === 'IncompleteSignature') {
        console.log(`  ${name}: ❌ Bad signature`);
      } else if (data.error_response) {
        console.log(`  ${name}: ⚠️ ${data.error_response.code}: ${data.error_response.msg}`);
      } else {
        console.log(`  ${name}: ✅ SUCCESS!`);
        console.log('  Response:', JSON.stringify(data).slice(0, 300));
        return name;
      }
    } catch (e) {
      console.log(`  ${name}: ❌ ${e.message}`);
    }
  }
  
  // Try also with sign_method=hmac-sha256
  console.log('\n  Trying sign_method=hmac-sha256...');
  baseParams.sign_method = 'hmac-sha256';
  baseParams.timestamp = Date.now().toString();
  
  for (const variant of ['A', 'B', 'C']) {
    const freshSigns = signMethods(baseParams, method);
    baseParams.sign = freshSigns[variant];
    baseParams.timestamp = Date.now().toString();
    const s2 = signMethods(baseParams, method);
    baseParams.sign = s2[variant];
    
    const qs = Object.entries(baseParams).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const url = 'https://api-sg.aliexpress.com/sync?' + qs;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.error_response?.code?.includes('Signature')) {
        console.log(`  hmac-sha256 ${variant}: ✅ ${JSON.stringify(data).slice(0, 200)}`);
        return;
      }
      console.log(`  hmac-sha256 ${variant}: ❌`);
    } catch (e) {}
  }
  
  console.log('\n  ⚠️ No method worked');
}

test();
