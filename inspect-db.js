const { Pool } = require('pg');
const pool = new Pool({ connectionString: "postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require" });

async function check() {
  const { rows } = await pool.query('SELECT * FROM ae_products ORDER BY created_at DESC LIMIT 1');
  console.log(JSON.stringify(rows[0], null, 2));
  process.exit(0);
}
check();
