const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_DWmSPHZu1f3k@ep-lucky-unit-a2tpz2g5-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function check() {
  const count = await sql`SELECT count(*) FROM ae_products`;
  console.log("TOTAL PRODUSE IN DB:", count[0].count);
  
  const cats = await sql`SELECT c.name, COUNT(p.id)::int as cnt FROM ae_categories c LEFT JOIN ae_products p ON p.category_id = c.ae_category_id WHERE c.level = 1 AND c.is_active = true GROUP BY c.name ORDER BY cnt DESC LIMIT 10`;
  console.log("\n=== CATEGORII REALE ===");
  cats.forEach(r => console.log(`  ${r.name}: ${r.cnt} products`));
}
check().catch(console.error);
