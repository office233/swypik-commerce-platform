#!/usr/bin/env node
/**
 * scripts/refresh-ae-token.mjs
 *
 * Refreshes the AliExpress Open Platform access_token using the stored
 * refresh_token, then atomically rewrites .env.production with the new
 * pair and an ALIEXPRESS_TOKEN_REFRESHED_AT timestamp.
 *
 * AliExpress tokens:
 *   access_token  expires in 30 days
 *   refresh_token expires in ~24 days (yes, refresh dies *before* access)
 *
 * Run this from cron every 7 days to keep both alive indefinitely.
 *
 * Designed to be safe to run repeatedly:
 *   - exits 0 if current access_token still has >7 days left (no-op)
 *   - exits 0 if refresh succeeds
 *   - exits 1 only on hard failure (signature error, expired refresh,
 *     network error). cron should alert on non-zero.
 *
 * Usage:
 *   node scripts/refresh-ae-token.mjs           # smart: refresh if < 7d left
 *   node scripts/refresh-ae-token.mjs --force   # always refresh
 *   node scripts/refresh-ae-token.mjs --check   # only print state, no write
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = process.env.AE_ENV_PATH || '/opt/swypik/app/infra/hetzner/.env.production';
const REGION_HOST = 'https://api-sg.aliexpress.com';
const REFRESH_PATH = '/auth/token/refresh';
// Trigger refresh when fewer than this many ms remain on the access_token.
// 7 days, well inside the 30-day window and safely before the refresh_token
// itself expires (~24 days).
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

const FORCE = process.argv.includes('--force');
const CHECK_ONLY = process.argv.includes('--check');

function readEnv() {
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2].replace(/^['"]|['"]$/g, ''));
  }
  return { text, lines, map };
}

function signRest(reqPath, params, secret) {
  const sorted = Object.keys(params).sort();
  const input = reqPath + sorted.map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(input, 'utf8').digest('hex').toUpperCase();
}

async function refresh(appKey, appSecret, refreshToken) {
  const params = {
    app_key: appKey,
    refresh_token: refreshToken,
    sign_method: 'sha256',
    timestamp: Date.now().toString(),
  };
  params.sign = signRest(REFRESH_PATH, params, appSecret);
  const qs = new URLSearchParams(params).toString();
  const url = `${REGION_HOST}/rest${REFRESH_PATH}?${qs}`;
  const res = await fetch(url, { method: 'POST' });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!json || !json.access_token) {
    throw new Error(`refresh failed: HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

function writeEnv(envLines, updates) {
  // updates: Map<key, value>. Replace existing lines, append missing keys.
  const seen = new Set();
  const out = envLines.map(line => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && updates.has(m[1])) {
      seen.add(m[1]);
      return `${m[1]}=${updates.get(m[1])}`;
    }
    return line;
  });
  for (const [k, v] of updates) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  // Atomic write: tmp + rename + chmod 600
  const tmp = ENV_PATH + '.tmp-refresh';
  fs.writeFileSync(tmp, out.join('\n'), { mode: 0o600 });
  fs.renameSync(tmp, ENV_PATH);
  fs.chmodSync(ENV_PATH, 0o600);
}

async function main() {
  const { lines, map } = readEnv();
  const appKey = map.get('ALIEXPRESS_APP_KEY');
  const appSecret = map.get('ALIEXPRESS_APP_SECRET');
  const refreshToken = map.get('ALIEXPRESS_REFRESH_TOKEN');
  const lastRefreshedAt = map.get('ALIEXPRESS_TOKEN_REFRESHED_AT');

  if (!appKey || !appSecret || !refreshToken) {
    console.error('FATAL: missing AE credentials in env');
    process.exit(2);
  }

  const refreshedAtMs = lastRefreshedAt ? Date.parse(lastRefreshedAt) : 0;
  const ageMs = Date.now() - refreshedAtMs;
  // 30-day access_token validity → trigger at age >= 23 days
  const accessExpiresInMs = (30 * 24 * 60 * 60 * 1000) - ageMs;
  const refreshExpiresInMs = (24 * 24 * 60 * 60 * 1000) - ageMs;

  const state = {
    last_refreshed_at: lastRefreshedAt || 'never',
    access_token_age_days: lastRefreshedAt ? (ageMs / 86400000).toFixed(1) : 'unknown',
    access_token_expires_in_days: lastRefreshedAt ? (accessExpiresInMs / 86400000).toFixed(1) : 'unknown',
    refresh_token_expires_in_days: lastRefreshedAt ? (refreshExpiresInMs / 86400000).toFixed(1) : 'unknown',
  };
  console.log(JSON.stringify({ event: 'ae_token_state', ...state }));

  if (CHECK_ONLY) {
    process.exit(0);
  }

  const needsRefresh = FORCE || !lastRefreshedAt || accessExpiresInMs < REFRESH_THRESHOLD_MS;
  if (!needsRefresh) {
    console.log(JSON.stringify({ event: 'ae_token_skip', reason: 'still_fresh', ...state }));
    process.exit(0);
  }

  if (refreshExpiresInMs <= 0 && !FORCE) {
    console.error(JSON.stringify({ event: 'ae_token_refresh_token_expired', refresh_token_expires_in_days: state.refresh_token_expires_in_days }));
    console.error('Refresh token itself has expired. Re-authorize via AE Open Platform OAuth flow.');
    process.exit(1);
  }

  console.log(JSON.stringify({ event: 'ae_token_refresh_start' }));
  const result = await refresh(appKey, appSecret, refreshToken);
  const now = new Date().toISOString();

  writeEnv(lines, new Map([
    ['ALIEXPRESS_ACCESS_TOKEN', result.access_token],
    ['ALIEXPRESS_REFRESH_TOKEN', result.refresh_token],
    ['ALIEXPRESS_TOKEN_REFRESHED_AT', now],
  ]));

  console.log(JSON.stringify({
    event: 'ae_token_refresh_ok',
    refreshed_at: now,
    access_token_prefix: result.access_token.slice(0, 24) + '...',
    expires_in_seconds: result.expires_in,
    refresh_expires_in_seconds: result.refresh_expires_in,
    next_refresh_recommended_in_days: 7,
  }));
}

main().catch(err => {
  console.error(JSON.stringify({ event: 'ae_token_refresh_fatal', error: String(err?.message || err) }));
  process.exit(1);
});
