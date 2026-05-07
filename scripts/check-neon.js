const { Pool } = require("pg");
const p = new Pool({
  connectionString: "postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false },
});

async function check() {
  try {
    const tables = await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    console.log("Tables:", tables.rows.map(r => r.tablename).join(", ") || "NONE");

    try {
      const count = await p.query("SELECT COUNT(*) as c FROM products");
      console.log("Products:", count.rows[0].c);
    } catch (e) {
      console.log("Products table: not yet created");
    }

    try {
      const cats = await p.query("SELECT COUNT(*) as c FROM categories");
      console.log("Categories:", cats.rows[0].c);
    } catch (e) {}

    try {
      const ship = await p.query("SELECT COUNT(*) as c FROM shipping_rates");
      console.log("Shipping rates:", ship.rows[0].c);
    } catch (e) {}
  } catch (e) {
    console.log("Connection error:", e.message);
  }
  p.end();
}
check();
