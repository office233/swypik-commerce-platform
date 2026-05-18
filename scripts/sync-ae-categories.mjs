// Sync ae_categories table from aliexpress.ds.category.get API.
// Idempotent upsert by ae_category_id. Existing rows updated with latest name + parent.
// Note: AE API returns only ~559 categories vs 733 already in DB; this script
// will refresh names but not delete extra rows.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/opt/swypik/app/package.json');
const { Pool } = require('pg');

function loadEnv() {
  const txt = fs.readFileSync('/opt/swypik/app/infra/hetzner/.env.production', 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
function hostDbUrl() {
  let u = process.env.DATABASE_URL || '';
  return u.replace(/@postgres:/, '@localhost:').replace(/@swypik-prod-postgres-1:/, '@localhost:');
}

loadEnv();

const APP_KEY = process.env.ALIEXPRESS_APP_KEY;
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET;
const TOKEN = process.env.ALIEXPRESS_ACCESS_TOKEN;
if (!APP_KEY || !APP_SECRET || !TOKEN) throw new Error('AliExpress credentials missing');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const locale = (args.find((a) => a.startsWith('--locale=')) || '--locale=EN').split('=')[1];

function sign(p) {
  const s = Object.keys(p).sort().map((k) => `${k}${p[k]}`).join('');
  return crypto.createHmac('sha256', APP_SECRET).update(s, 'utf8').digest('hex').toUpperCase();
}
async function callAE(method, params = {}) {
  const all = {
    app_key: APP_KEY, method, session: TOKEN, sign_method: 'sha256',
    timestamp: new Date().toISOString().replace(/\.\d+Z/, '+0000').replace('T', ' '),
    v: '2.0', format: 'json',
  };
  for (const [k, v] of Object.entries(params)) if (v != null) all[k] = String(v);
  all.sign = sign(all);
  const url = new URL('https://api-sg.aliexpress.com/sync');
  url.search = new URLSearchParams(all).toString();
  const res = await fetch(url, { method: 'POST' });
  return res.json();
}

console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}, locale=${locale}`);
console.log('Calling aliexpress.ds.category.get …');
const resp = await callAE('aliexpress.ds.category.get', { locale });
const cats = resp?.aliexpress_ds_category_get_response?.resp_result?.result?.categories?.category || [];
const total = resp?.aliexpress_ds_category_get_response?.resp_result?.result?.total_result_count;
console.log(`API returned ${cats.length} categories (total_result_count=${total})`);
if (!cats.length) {
  console.error('Empty response, aborting:', JSON.stringify(resp).slice(0, 800));
  process.exit(1);
}

const pool = new Pool({ connectionString: hostDbUrl() });
const client = await pool.connect();
const stats = { inserted: 0, updated: 0, unchanged: 0, errors: 0 };
try {
  await client.query('BEGIN');
  for (const c of cats) {
    const id = Number(c.category_id);
    const parentRaw = c.parent_category_id;
    const parent = parentRaw == null || Number(parentRaw) === 0 ? null : Number(parentRaw);
    const name = String(c.category_name || '').slice(0, 200);
    const level = parent ? 2 : 1;
    if (!Number.isFinite(id) || !name) continue;

    if (apply) {
      try {
        const r = await client.query(
          `INSERT INTO ae_categories (ae_category_id, parent_id, name, level, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (ae_category_id) DO UPDATE SET
             name = EXCLUDED.name,
             parent_id = COALESCE(EXCLUDED.parent_id, ae_categories.parent_id),
             level = EXCLUDED.level
           RETURNING (xmax = 0) AS inserted`,
          [id, parent, name, level]
        );
        if (r.rows[0].inserted) stats.inserted++;
        else stats.updated++;
      } catch (err) {
        stats.errors++;
        console.error(`  ERR id=${id}: ${err.message}`);
      }
    } else {
      // dry-run: check existence
      const r = await client.query('SELECT name, parent_id FROM ae_categories WHERE ae_category_id = $1', [id]);
      if (!r.rows.length) stats.inserted++;
      else if (r.rows[0].name !== name || r.rows[0].parent_id !== parent) stats.updated++;
      else stats.unchanged++;
    }
  }
  if (apply) await client.query('COMMIT');
  else await client.query('ROLLBACK');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('FATAL:', err);
  throw err;
} finally {
  client.release();
}

const finalCount = await pool.query('SELECT count(*)::int AS n FROM ae_categories');
console.log('\n== Sync result ==');
console.log(JSON.stringify(stats, null, 2));
console.log(`Total ae_categories rows: ${finalCount.rows[0].n}`);
await pool.end();
