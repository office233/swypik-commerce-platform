const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
  await c.connect();
  
  const { rows: db } = await c.query('SELECT current_database() as db');
  console.log('DATABASE:', db[0].db);
  console.log('HOST: ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech');
  
  const { rows: tables } = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ae_%' ORDER BY table_name`);
  console.log('TABELE AE:', tables.map(r => r.table_name).join(', '));
  
  const { rows: cnt } = await c.query('SELECT COUNT(*) as c FROM ae_products');
  console.log('PRODUSE AE:', cnt[0].c);
  
  // Check if there are therapium tables
  const { rows: thera } = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'therapium%' LIMIT 5`);
  console.log('TABELE THERAPIUM:', thera.length ? thera.map(r => r.table_name).join(', ') : 'ZERO — nu exista!');
  
  // Check .env for which project this is
  console.log('\nCONEXIUNE: ep-cold-hat-alaqlcr5 = PROIECT NEON: steep-sky-94161335');
  console.log('ASTA ESTE BAZA DE DATE AICEVREI ✅');
  
  await c.end();
})();
