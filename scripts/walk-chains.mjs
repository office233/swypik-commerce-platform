#!/usr/bin/env node
// Walk authoritative parent chain via aliexpress.ds.category.get for fixture-sourced leaves.
// Replaces breadcrumb-soup chains with clean parent->child chains.
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: '/opt/swypik/worktrees/catalog-clean/infra/hetzner/.env.production' });

const APP_KEY = process.env.ALIEXPRESS_APP_KEY, APP_SECRET = process.env.ALIEXPRESS_APP_SECRET, ACCESS_TOKEN = process.env.ALIEXPRESS_ACCESS_TOKEN;
const DB = process.env.DATABASE_URL.replace('@postgres:', '@localhost:');
const sign = p => crypto.createHmac('sha256', APP_SECRET).update(Object.keys(p).sort().map(k => k + p[k]).join('')).digest('hex').toUpperCase();
const ts = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}+0000`; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// API call: getCategory(X) -> {id: parent_or_self_if_root, name, parent}
async function getCategory(categoryId) {
  const all = { method: 'aliexpress.ds.category.get', app_key: APP_KEY, session: ACCESS_TOKEN, sign_method: 'sha256', timestamp: ts(), v: '2.0', format: 'json', categoryId: String(categoryId) };
  all.sign = sign(all);
  const u = new URL('https://api-sg.aliexpress.com/sync');
  Object.entries(all).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await (await fetch(u)).json();
      const cats = r.aliexpress_ds_category_get_response?.resp_result?.result?.categories?.category;
      const arr = Array.isArray(cats) ? cats : cats ? [cats] : [];
      const n = arr[0];
      if (!n) return null;
      return { id: Number(n.category_id), name: String(n.category_name || ''), parent: Number(n.parent_category_id || 0) };
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(3000);
    }
  }
}

const idToName = new Map();   // category_id -> en name (learned from API)
const idToParent = new Map(); // category_id -> parent_id (learned from API)
const callCache = new Map();  // input id -> result of getCategory

async function getCategoryCached(id) {
  if (callCache.has(id)) return callCache.get(id);
  const r = await getCategory(id);
  callCache.set(id, r);
  await sleep(2500);
  if (r) {
    // We learn (id=r.id, name=r.name, parent=r.parent). We also know that the input id has parent=r.id (unless r.id===id which means input was root).
    idToName.set(r.id, r.name);
    idToParent.set(r.id, r.parent);
    if (r.id !== id) {
      // input was a child; learn that input's parent = r.id
      idToParent.set(id, r.id);
    } else {
      // input is itself a root
      idToParent.set(id, 0);
    }
  }
  return r;
}

async function walkChain(leafId) {
  const chain = [Number(leafId)];
  const seen = new Set([Number(leafId)]);
  let cur = Number(leafId);
  while (true) {
    let parent = idToParent.get(cur);
    if (parent === undefined) {
      await getCategoryCached(cur);
      parent = idToParent.get(cur);
    }
    if (!parent || parent === 0 || seen.has(parent)) break;
    chain.unshift(parent);
    seen.add(parent);
    cur = parent;
    if (chain.length > 6) break;
  }
  return chain;
}

async function main() {
  const pool = new pg.Pool({ connectionString: DB });
  const limit = Number(process.argv[2] || 999);
  const { rows } = await pool.query(`SELECT leaf_id FROM ae_category_full_chain WHERE source IN ('fixture') ORDER BY leaf_id LIMIT $1`, [limit]);
  console.log(`Leaves to re-walk: ${rows.length}`);

  // Seed idToName from ae_categories
  const seed = await pool.query(`SELECT ae_category_id, name, name_ro FROM ae_categories`);
  const aeCatNameRo = new Map();
  for (const r of seed.rows) {
    idToName.set(Number(r.ae_category_id), r.name);
    aeCatNameRo.set(Number(r.ae_category_id), r.name_ro || r.name);
  }

  let updated = 0, failed = 0, apiCalls = 0;
  for (let i = 0; i < rows.length; i++) {
    const leaf = Number(rows[i].leaf_id);
    try {
      const before = callCache.size;
      const chain = await walkChain(leaf);
      apiCalls += callCache.size - before;
      if (chain.length < 2) { failed++; console.log(`[${i + 1}/${rows.length}] leaf=${leaf} SHORT_CHAIN len=${chain.length}`); continue; }
      const rootId = chain[0];
      const chainNamesEn = chain.map(id => idToName.get(id) || '');
      const chainNamesRo = chain.map(id => aeCatNameRo.get(id) || idToName.get(id) || '');
      await pool.query(
        `UPDATE ae_category_full_chain
         SET chain_ids=$2, chain_names_en=$3, chain_names_ro=$4, depth=$5, root_id=$6, source='category.get', updated_at=now()
         WHERE leaf_id=$1`,
        [leaf, chain, chainNamesEn, chainNamesRo, chain.length, rootId]
      );
      updated++;
      console.log(`[${i + 1}/${rows.length}] leaf=${leaf} chain=${chain.join('>')} names=${chainNamesEn.join('>')}`);
    } catch (e) {
      failed++;
      console.log(`[${i + 1}/${rows.length}] leaf=${leaf} ERR ${e.message}`);
    }
  }
  console.log(`\nDone. updated=${updated} failed=${failed} api_calls=${apiCalls} cached_nodes=${idToParent.size}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
