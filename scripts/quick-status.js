const { Pool } = require("pg");
const pool = new Pool({ host:"localhost", port:5432, database:"aicevrei_products_cj", user:"postgres", password:"postgres" });

(async () => {
  const r = await pool.query("SELECT COUNT(*) as total FROM products");
  const g = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE (is_filtered=false OR is_filtered IS NULL) AND retail_price_gbp > 0");
  const d = await pool.query("SELECT COUNT(*) as cnt FROM products WHERE description IS NOT NULL");
  const cats = await pool.query("SELECT split_part(category, ' > ', 1) as m, COUNT(*) as c FROM products GROUP BY 1 ORDER BY c DESC");
  
  console.log("Total products:", r.rows[0].total);
  console.log("Good + priced:", g.rows[0].cnt);
  console.log("Has description:", d.rows[0].cnt);
  console.log("\nCategories:");
  cats.rows.forEach(c => console.log("  " + String(c.c).padStart(6) + " | " + c.m));
  
  await pool.end();
})();
