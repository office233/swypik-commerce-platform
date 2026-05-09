const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function check() {
  const c = new Client(NEON_URL);
  await c.connect();
  const { rows } = await c.query('SELECT ae_category_id, name, name_ro FROM ae_categories WHERE level = 1 ORDER BY ae_category_id');
  console.table(rows);
  await c.end();
}
check();
