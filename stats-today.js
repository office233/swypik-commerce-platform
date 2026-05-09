const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });

async function stats() {
  const [today, total, vids, times] = await Promise.all([
    pool.query("SELECT COUNT(*) as c FROM ae_products WHERE created_at >= '2026-05-09T09:54:00Z'"),
    pool.query("SELECT COUNT(*) as c FROM ae_products"),
    pool.query("SELECT COUNT(*) as c FROM ae_products WHERE has_video = true"),
    pool.query("SELECT MIN(created_at) as first_at, MAX(created_at) as last_at FROM ae_products WHERE created_at >= '2026-05-09T09:54:00Z'"),
  ]);
  console.log('═══════════════════════════════════════');
  console.log('  📊 RAPORT IMPORT — 9 Mai 2026');
  console.log('═══════════════════════════════════════');
  console.log('Produse importate AZI (cu noul token):', today.rows[0].c);
  console.log('TOTAL produse în DB:', total.rows[0].c);
  console.log('Total cu video:', vids.rows[0].c);
  console.log('Prima importare azi:', times.rows[0].first_at);
  console.log('Ultima importare azi:', times.rows[0].last_at);
  process.exit(0);
}
stats();
