const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN_FILE = path.join(__dirname, '../ae-token.json');

async function refreshToken() {
  let tokens;
  try {
    tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch (e) {
    console.error('❌ Could not read ae-token.json');
    return;
  }

  const params = {
    app_key: APP_KEY,
    sign_method: 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
    sp: 'ds'
  };

  const sorted = Object.keys(params).sort();
  const signStr = '/auth/token/create' + sorted.map(k => k + params[k]).join('');
  params.sign = crypto.createHmac('sha256', APP_SECRET).update(signStr).digest('hex').toUpperCase();

  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  
  try {
    const res = await fetch('https://api-sg.aliexpress.com/rest/auth/token/create?' + qs, { method: 'POST' });
    const data = await res.json();
    
    if (data.access_token && data.refresh_token) {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      }, null, 2));
      console.log('✅ Access Token auto-refreshed successfully! Permanent session active.');
    } else {
      console.log('⚠️ Token refresh response:', data);
    }
  } catch (err) {
    console.error('❌ Failed to auto-refresh token:', err);
  }
}

refreshToken();
