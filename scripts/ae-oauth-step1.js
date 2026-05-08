/**
 * AliExpress OAuth — Step 1: Generate Authorization URL
 * User visits this URL, logs in, and authorizes the app
 * AliExpress redirects back with an authorization code
 */

const APP_KEY = '533768';
const REDIRECT_URI = 'https://aicevrei.ro/api/aliexpress/callback';

// OAuth authorization URL
const authUrl = `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${APP_KEY}`;

console.log('='.repeat(75));
console.log('  🔐 ALIEXPRESS OAUTH — AUTORIZARE');
console.log('='.repeat(75));
console.log('');
console.log('  Deschide acest link în browser:');
console.log('');
console.log('  ' + authUrl);
console.log('');
console.log('  1. Te va duce pe AliExpress login');
console.log('  2. Autorizezi aplicația "AICeVrei Dropshipping Platform"');
console.log('  3. Vei fi redirectat la: ' + REDIRECT_URI);
console.log('  4. În URL-ul de redirect va fi un parametru "code=xxx"');
console.log('  5. Copiază acel code și rulează Step 2');
console.log('');
console.log('='.repeat(75));
