/**
 * Push environment variables to Vercel from .env.local
 * 
 * SECURITY: This file reads from .env.local (which is gitignored).
 * Never commit secrets directly in code.
 * 
 * Usage: node push-env.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read env vars from .env.local (gitignored)
const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found. Create it first with your secrets.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envs = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  const key = trimmed.substring(0, eqIdx).trim();
  const value = trimmed.substring(eqIdx + 1).trim();
  if (key && value) envs[key] = value;
}

console.log(`Found ${Object.keys(envs).length} env vars in .env.local\n`);

for (const [key, value] of Object.entries(envs)) {
  try {
    console.log(`Pushing ${key}...`);
    try { execSync(`npx vercel env rm ${key} production -y`, { stdio: 'ignore' }); } catch(e) {}
    execSync(`powershell -Command "Write-Output '${value}' | npx vercel env add ${key} production"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Failed to push ${key}:`, err.message);
  }
}
console.log("\n✅ Done! All env vars pushed to Vercel.");
