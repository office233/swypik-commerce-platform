const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_DWmSPHZu1f3k@ep-lucky-unit-a2tpz2g5-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require');

async function check() {
  const cats = await sql`SELECT c.name, COUNT(p.id)::int as cnt FROM ae_categories c LEFT JOIN ae_products p ON p.category_id = c.ae_category_id WHERE c.level = 1 AND c.is_active = true GROUP BY c.name ORDER BY cnt DESC`;
  console.log("=== CATEGORIES ===");
  cats.forEach(r => console.log(`  ${r.name}: ${r.cnt} products`));

  // Test search for gaming in Computer & Office
  const gaming = await sql`SELECT p.title, p.price_ron FROM ae_products p JOIN ae_categories c ON c.ae_category_id = p.category_id WHERE c.name ILIKE '%Computer%' AND p.price_ron <= 4000 AND p.main_image IS NOT NULL ORDER BY p.orders_count DESC NULLS LAST LIMIT 5`;
  console.log("\n=== GAMING/COMPUTER PRODUCTS (sub 4000 lei) ===");
  gaming.forEach(r => console.log(`  ${r.title?.slice(0,60)} — ${r.price_ron} lei`));

  // Test bijuterii
  const jewelry = await sql`SELECT p.title, p.price_ron FROM ae_products p JOIN ae_categories c ON c.ae_category_id = p.category_id WHERE c.name ILIKE '%Jewelry%' AND p.main_image IS NOT NULL ORDER BY p.orders_count DESC NULLS LAST LIMIT 5`;
  console.log("\n=== JEWELRY PRODUCTS ===");
  jewelry.forEach(r => console.log(`  ${r.title?.slice(0,60)} — ${r.price_ron} lei`));

  // Test pet
  const pets = await sql`SELECT p.title, p.price_ron FROM ae_products p JOIN ae_categories c ON c.ae_category_id = p.category_id WHERE c.name ILIKE '%Pet%' AND p.main_image IS NOT NULL ORDER BY p.orders_count DESC NULLS LAST LIMIT 5`;
  console.log("\n=== PET PRODUCTS ===");
  pets.forEach(r => console.log(`  ${r.title?.slice(0,60)} — ${r.price_ron} lei`));
}
check().catch(console.error);
