const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
  await c.connect();
  
  // Show what exists
  const { rows: before } = await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  console.log('Tabele ÎNAINTE:', before.map(r => r.tablename).join(', '));
  
  // Drop ALL
  for (const t of before) {
    await c.query(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
    console.log(`  ❌ ȘTERS: ${t.tablename}`);
  }
  
  const { rows: after } = await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  console.log('\nTabele DUPĂ:', after.map(r => r.tablename).join(', ') || '🧹 GATA — BAZA E GOALĂ');
  
  await c.end();
})();
