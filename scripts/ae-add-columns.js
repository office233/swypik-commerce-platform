/**
 * Adaugă coloanele de filtre în ae_products + ae_variants
 */
const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

(async () => {
  const c = new Client({ connectionString: NEON_URL });
  await c.connect();

  console.log('📦 ae_products — coloane noi:');
  const prodCols = [
    ['delivery_date_desc', 'VARCHAR'],
    ['neckline', 'VARCHAR'],
    ['style', 'VARCHAR'],
    ['fabric_type', 'VARCHAR'],
    ['color', 'VARCHAR'],
    ['colors', 'TEXT[]'],
    ['sizes', 'TEXT[]'],
    ['material', 'VARCHAR'],
    ['pattern_type', 'VARCHAR'],
    ['sleeve_style', 'VARCHAR'],
    ['waistline', 'VARCHAR'],
    ['season', 'VARCHAR'],
    ['silhouette', 'VARCHAR'],
    ['decoration', 'TEXT[]'],
    ['gender', "VARCHAR DEFAULT 'unisex'"],
    ['free_shipping_threshold', 'VARCHAR'],
    ['available_stock', 'INTEGER DEFAULT 0'],
  ];
  for (const [col, type] of prodCols) {
    await c.query(`ALTER TABLE ae_products ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    console.log(`  ✅ ${col}`);
  }

  console.log('\n📋 ae_variants — coloane noi:');
  const varCols = [['color', 'VARCHAR'], ['size', 'VARCHAR']];
  for (const [col, type] of varCols) {
    await c.query(`ALTER TABLE ae_variants ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    console.log(`  ✅ ${col}`);
  }

  console.log('\n🔑 Indexuri pentru filtre:');
  const indexes = [
    'idx_prod_color ON ae_products(color)',
    'idx_prod_material ON ae_products(material)',
    'idx_prod_style ON ae_products(style)',
    'idx_prod_gender ON ae_products(gender)',
    'idx_prod_season ON ae_products(season)',
    'idx_prod_neckline ON ae_products(neckline)',
    'idx_prod_fabric ON ae_products(fabric_type)',
    'idx_prod_pattern ON ae_products(pattern_type)',
    'idx_prod_sleeve ON ae_products(sleeve_style)',
    'idx_prod_silhouette ON ae_products(silhouette)',
    'idx_prod_stock ON ae_products(available_stock)',
    'idx_var_color ON ae_variants(color)',
    'idx_var_size ON ae_variants(size)',
  ];
  for (const idx of indexes) {
    await c.query(`CREATE INDEX IF NOT EXISTS ${idx}`);
    console.log(`  ✅ ${idx.split(' ')[0]}`);
  }

  // Verify
  const { rows: pc } = await c.query(`SELECT COUNT(*) as c FROM information_schema.columns WHERE table_name='ae_products'`);
  const { rows: vc } = await c.query(`SELECT COUNT(*) as c FROM information_schema.columns WHERE table_name='ae_variants'`);
  console.log(`\n✅ ae_products: ${pc[0].c} coloane | ae_variants: ${vc[0].c} coloane`);
  await c.end();
})();
