const { Pool } = require('@neondatabase/serverless');

async function audit() {
  console.log('=== AUDIT END-TO-END AICEVREI.RO ===\n');
  
  // 1. API Products Route (Edge)
  try {
    const st1 = Date.now();
    const res1 = await fetch('https://aicevrei.ro/api/products?mode=trending&limit=5');
    const d1 = await res1.json();
    console.log(`✅ API Feed Produse (Edge): [${res1.status}] ${Date.now() - st1}ms -> ${d1.products?.length || 0} produse încărcate.`);
  } catch (e) { console.log('❌ API Feed Produse EROARE:', e.message); }

  // 2. Search API / Caching
  try {
    const st2 = Date.now();
    const res2 = await fetch('https://aicevrei.ro/api/search/suggest?q=rochii');
    const d2 = await res2.json();
    console.log(`✅ API Autocomplete (AI Search): [${res2.status}] ${Date.now() - st2}ms -> ${d2.suggestions?.length || 0} sugestii extrase.`);
  } catch (e) { console.log('❌ API Autocomplete EROARE:', e.message); }
  
  // 3. Database State (NeonDB)
  try {
    const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
    const st3 = Date.now();
    const dbRes = await pool.query('SELECT count(*) as count FROM ae_products');
    const dbVid = await pool.query("SELECT count(*) as count FROM ae_products WHERE video_url LIKE '%cdn.aicevrei%'");
    const dbVar = await pool.query('SELECT count(*) as count FROM ae_variants');
    console.log(`✅ Baza de date (NeonDB): ${Date.now() - st3}ms răspuns ultra-rapid.`);
    console.log(`   📦 Produse curente: ${dbRes.rows[0].count}`);
    console.log(`   🎬 Produse cu video (TikTok Mode): ${dbVid.rows[0].count}`);
    console.log(`   🎨 Variante stocate: ${dbVar.rows[0].count}`);
  } catch (e) { console.log('❌ Bază de date EROARE:', e.message); }

  console.log('\n=== AUDIT COMPLET ===');
  process.exit(0);
}

audit();
