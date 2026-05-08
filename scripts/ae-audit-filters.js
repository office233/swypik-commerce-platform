const { Client } = require('pg');
const NEON = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';
(async () => {
  const c = new Client({ connectionString: NEON });
  await c.connect();
  const q = async (s) => (await c.query(s)).rows;

  console.log('=== FILTRE POPULATE ===');
  const [t] = await q("SELECT COUNT(*) as c FROM ae_products");
  const total = t.c;

  const filters = ['color','neckline','style','fabric_type','material','pattern_type','sleeve_style','season','silhouette'];
  for (const f of filters) {
    const [r] = await q(`SELECT COUNT(*) as c FROM ae_products WHERE ${f} IS NOT NULL`);
    const [u] = await q(`SELECT COUNT(DISTINCT ${f}) as c FROM ae_products WHERE ${f} IS NOT NULL`);
    console.log(`  ${f.padEnd(18)} ${r.c}/${total} populate (${u.c} valori unice)`);
  }
  
  const [sz] = await q("SELECT COUNT(*) as c FROM ae_products WHERE sizes IS NOT NULL");
  const [cl] = await q("SELECT COUNT(*) as c FROM ae_products WHERE colors IS NOT NULL");
  console.log(`  ${'sizes[]'.padEnd(18)} ${sz.c}/${total} populate`);
  console.log(`  ${'colors[]'.padEnd(18)} ${cl.c}/${total} populate`);

  console.log('\n=== VARIANT COLOR/SIZE ===');
  const [vt] = await q("SELECT COUNT(*) as c FROM ae_variants");
  const [vc] = await q("SELECT COUNT(*) as c FROM ae_variants WHERE color IS NOT NULL");
  const [vs] = await q("SELECT COUNT(*) as c FROM ae_variants WHERE size IS NOT NULL");
  console.log(`  variant color: ${vc.c}/${vt.c}`);
  console.log(`  variant size: ${vs.c}/${vt.c}`);

  console.log('\n=== STOC ===');
  const [st] = await q("SELECT COUNT(CASE WHEN available_stock>0 THEN 1 END) as has, COUNT(CASE WHEN available_stock=0 OR available_stock IS NULL THEN 1 END) as zero FROM ae_products");
  console.log(`  Stock>0: ${st.has} | Stock=0: ${st.zero}`);
  
  // Total variant stock
  const [vs2] = await q("SELECT SUM(stock) as total FROM ae_variants WHERE stock > 0");
  console.log(`  Variant stock total: ${vs2.total || 0}`);
  
  console.log('\n=== DELIVERY DATE ===');
  const [dd] = await q("SELECT COUNT(*) as c FROM ae_products WHERE delivery_date_desc IS NOT NULL AND delivery_date_desc != ''");
  console.log(`  Cu delivery date: ${dd.c}/${total}`);

  console.log('\n=== TOP CULORI ===');
  const topColors = await q("SELECT color, COUNT(*) as cnt FROM ae_products WHERE color IS NOT NULL GROUP BY color ORDER BY cnt DESC LIMIT 10");
  topColors.forEach(r => console.log(`  ${r.color}: ${r.cnt}`));

  console.log('\n=== TOP STILURI ===');
  const topStyles = await q("SELECT style, COUNT(*) as cnt FROM ae_products WHERE style IS NOT NULL GROUP BY style ORDER BY cnt DESC LIMIT 10");
  topStyles.forEach(r => console.log(`  ${r.style}: ${r.cnt}`));

  console.log('\n=== TOP NECKLINE ===');
  const topNeck = await q("SELECT neckline, COUNT(*) as cnt FROM ae_products WHERE neckline IS NOT NULL GROUP BY neckline ORDER BY cnt DESC LIMIT 8");
  topNeck.forEach(r => console.log(`  ${r.neckline}: ${r.cnt}`));

  await c.end();
})();
