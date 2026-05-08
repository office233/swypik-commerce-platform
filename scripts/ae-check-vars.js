const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
  await c.connect();
  
  const { rows: vars } = await c.query('SELECT variant_name, price_ron, color, size, stock, variant_image FROM ae_variants ORDER BY id DESC LIMIT 12');
  console.log('ULTIMELE 12 VARIANTE:');
  vars.forEach(r => {
    console.log(`  ${(r.variant_name||'-').padEnd(30)} ${String(r.price_ron).padStart(5)} RON  color: ${(r.color||'-').padEnd(12)} size: ${(r.size||'-').padEnd(6)} stoc: ${r.stock}  img: ${r.variant_image ? 'DA' : 'NU'}`);
  });
  
  await c.end();
})();
