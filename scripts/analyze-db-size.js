const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require' });
async function check() {
  const res = await pool.query(`
    SELECT 
      current_database() as db_name,
      pg_size_pretty(pg_database_size(current_database())) as total_size,
      pg_database_size(current_database()) as total_bytes,
      (SELECT count(*) FROM ae_products) as products_count,
      (SELECT pg_total_relation_size('ae_products')) as products_table_bytes,
      (SELECT count(*) FROM ae_variants) as variants_count,
      (SELECT pg_total_relation_size('ae_variants')) as variants_table_bytes
  `);
  console.log(JSON.stringify(res.rows[0], null, 2));
  process.exit(0);
}
check();
