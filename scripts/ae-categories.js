/**
 * 📂 Pull TOATE categoriile și subcategoriile AliExpress
 */
const crypto = require('crypto');

const APP_KEY = '533768';
const APP_SECRET = 'X6aUu7WINyDXsgShb3U1PwPg4RsNGXqG';
const TOKEN = '50000701515cI1wbirc0OfbGepB17806034tzvfoHwhafyXnd0DoTbyvzyPjROP64VKm';

function sign(params) {
  const sorted = Object.keys(params).filter(k => k !== 'sign').sort();
  return crypto.createHmac('sha256', APP_SECRET).update(sorted.map(k => k + params[k]).join('')).digest('hex').toUpperCase();
}
async function callAPI(method, extra = {}) {
  const params = { app_key: APP_KEY, method, sign_method: 'sha256', timestamp: Date.now().toString(), format: 'json', v: '2.0', session: TOKEN, ...extra };
  params.sign = sign(params);
  const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return (await fetch('https://api-sg.aliexpress.com/sync?' + qs)).json();
}

async function main() {
  console.log('📂 Pulling ALL AliExpress categories...\n');

  const data = await callAPI('aliexpress.ds.category.get', { category_id: '0' });
  const allCats = data.aliexpress_ds_category_get_response?.resp_result?.result?.categories?.category || [];
  
  console.log(`Total categorii: ${allCats.length}\n`);

  // Build tree: parent → children
  const roots = allCats.filter(c => !c.parent_category_id);
  const children = allCats.filter(c => c.parent_category_id);

  // Group children by parent
  const childMap = {};
  for (const c of children) {
    if (!childMap[c.parent_category_id]) childMap[c.parent_category_id] = [];
    childMap[c.parent_category_id].push(c);
  }

  // Check if there are deeper levels
  const level2Parents = children.map(c => c.category_id);
  const level3 = allCats.filter(c => level2Parents.includes(c.parent_category_id));

  console.log(`📊 Structură:`);
  console.log(`  Categorii principale (nivel 1): ${roots.length}`);
  console.log(`  Subcategorii (nivel 2): ${children.length}`);
  console.log(`  Sub-subcategorii (nivel 3): ${level3.length}\n`);

  console.log('='.repeat(80));
  console.log('  📂 ARBORELE COMPLET DE CATEGORII');
  console.log('='.repeat(80));

  for (const root of roots.sort((a,b) => a.category_name.localeCompare(b.category_name))) {
    const subs = childMap[root.category_id] || [];
    console.log(`\n📁 ${root.category_id}: ${root.category_name} (${subs.length} subcategorii)`);
    
    for (const sub of subs.sort((a,b) => a.category_name.localeCompare(b.category_name))) {
      const subsubs = childMap[sub.category_id] || [];
      const extra = subsubs.length ? ` (${subsubs.length} sub-sub)` : '';
      console.log(`  ├─ ${sub.category_id}: ${sub.category_name}${extra}`);
      
      for (const ss of subsubs.slice(0, 3)) {
        console.log(`  │  └─ ${ss.category_id}: ${ss.category_name}`);
      }
      if (subsubs.length > 3) console.log(`  │  └─ ... +${subsubs.length - 3} more`);
    }
  }

  // Save full tree as JSON
  const fs = require('fs');
  const tree = roots.map(r => ({
    id: r.category_id,
    name: r.category_name,
    children: (childMap[r.category_id] || []).map(c => ({
      id: c.category_id,
      name: c.category_name,
      children: (childMap[c.category_id] || []).map(cc => ({
        id: cc.category_id,
        name: cc.category_name,
      })),
    })),
  }));
  
  fs.writeFileSync('d:\\Aicevrei\\ae-categories.json', JSON.stringify(tree, null, 2));
  console.log('\n\n💾 Salvat în ae-categories.json');
}

main().catch(e => console.error('FATAL:', e.message));
