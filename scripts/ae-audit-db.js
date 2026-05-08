const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

(async () => {
  const c = new Client({ connectionString: NEON_URL });
  await c.connect();

  console.log('═'.repeat(70));
  console.log('  AUDIT COMPLET — Schema NeonDB');
  console.log('═'.repeat(70));

  // ae_products columns
  console.log('\n📦 ae_products COLUMNS:');
  const { rows: pc } = await c.query(`SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns WHERE table_name='ae_products' ORDER BY ordinal_position`);
  pc.forEach(r => console.log(`  ${r.column_name.padEnd(25)} ${r.data_type.padEnd(25)} ${r.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'} ${r.column_default || ''}`));

  // ae_variants columns
  console.log('\n📋 ae_variants COLUMNS:');
  const { rows: vc } = await c.query(`SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns WHERE table_name='ae_variants' ORDER BY ordinal_position`);
  vc.forEach(r => console.log(`  ${r.column_name.padEnd(25)} ${r.data_type.padEnd(25)} ${r.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'} ${r.column_default || ''}`));

  // ae_categories columns
  console.log('\n📂 ae_categories COLUMNS:');
  const { rows: cc } = await c.query(`SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns WHERE table_name='ae_categories' ORDER BY ordinal_position`);
  cc.forEach(r => console.log(`  ${r.column_name.padEnd(25)} ${r.data_type.padEnd(25)} ${r.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'} ${r.column_default || ''}`));

  // Indexes
  console.log('\n🔑 INDEXES:');
  const { rows: idx } = await c.query(`SELECT indexname, tablename, indexdef FROM pg_indexes 
    WHERE tablename IN ('ae_products','ae_variants','ae_categories') ORDER BY tablename`);
  idx.forEach(r => console.log(`  ${r.tablename.padEnd(15)} ${r.indexname}`));

  // Constraints
  console.log('\n🔒 CONSTRAINTS:');
  const { rows: con } = await c.query(`SELECT tc.table_name, tc.constraint_name, tc.constraint_type 
    FROM information_schema.table_constraints tc 
    WHERE tc.table_name IN ('ae_products','ae_variants','ae_categories')`);
  con.forEach(r => console.log(`  ${r.table_name.padEnd(15)} ${r.constraint_type.padEnd(15)} ${r.constraint_name}`));

  // Categories count
  console.log('\n📊 STATISTICI:');
  const { rows: catCnt } = await c.query(`SELECT COUNT(*) as c FROM ae_categories`);
  const { rows: pCnt } = await c.query(`SELECT COUNT(*) as c FROM ae_products`);
  const { rows: vCnt } = await c.query(`SELECT COUNT(*) as c FROM ae_variants`);
  console.log(`  Categorii: ${catCnt[0].c}`);
  console.log(`  Produse: ${pCnt[0].c}`);
  console.log(`  Variante: ${vCnt[0].c}`);

  // Check what's MISSING
  console.log('\n⚠️ ANALIZĂ — CE LIPSEȘTE:');
  
  const needed = [
    // Essential for filters
    { col: 'delivery_date_desc', tab: 'ae_products', desc: 'Data estimată livrare (ex: May 15-22)' },
    { col: 'color', tab: 'ae_products', desc: 'Culoare principală pentru filtre' },
    { col: 'size', tab: 'ae_products', desc: 'Mărimi disponibile pentru filtre' },
    { col: 'material', tab: 'ae_products', desc: 'Material produs' },
    { col: 'style', tab: 'ae_products', desc: 'Stil (casual, elegant, etc.)' },
    { col: 'season', tab: 'ae_products', desc: 'Sezon (vară, iarnă, etc.)' },
    { col: 'gender', tab: 'ae_products', desc: 'Gen (femei, bărbați, unisex)' },
    { col: 'free_shipping_threshold', tab: 'ae_products', desc: 'Prag livrare gratuită ($10)' },
    { col: 'available_stock', tab: 'ae_products', desc: 'Stoc total disponibil' },
  ];

  const existingCols = pc.map(r => r.column_name);
  needed.forEach(n => {
    if (existingCols.includes(n.col)) {
      console.log(`  ✅ ${n.col} — EXISTĂ`);
    } else {
      console.log(`  ❌ ${n.col} — LIPSEȘTE — ${n.desc}`);
    }
  });

  // Check variant columns for filters
  console.log('\n  Variante (filtre):');
  const existingVarCols = vc.map(r => r.column_name);
  ['color', 'size'].forEach(col => {
    if (existingVarCols.includes(col)) {
      console.log(`  ✅ ${col} — EXISTĂ în ae_variants`);
    } else {
      console.log(`  ❌ ${col} — LIPSEȘTE în ae_variants`);
    }
  });

  await c.end();
})();
