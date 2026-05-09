const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  try {
    console.log('Checking database extensions...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    console.log('✅ Extension pg_trgm ready');

    console.log('Creating GIN indexes for fast ILIKE searches...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_title_ro_trgm ON ae_products USING GIN (title_ro gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON ae_products USING GIN (title gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_products_category_id ON ae_products (category_id);
    `);
    console.log('✅ GIN Indexes created! The DB is now ready for millions of rows.');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
run();
