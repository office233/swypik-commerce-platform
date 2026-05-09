const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function checkIndexes() {
  const c = new Client(NEON_URL);
  await c.connect();
  const { rows } = await c.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'ae_products';
  `);
  console.table(rows);
  await c.end();
}
checkIndexes();
