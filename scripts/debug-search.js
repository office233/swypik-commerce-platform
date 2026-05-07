const { Pool } = require("pg");
const pool = new Pool({ 
  connectionString: "postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require", 
  ssl: { rejectUnauthorized: false } 
});

const searches = [
  { cat: "Beauty", queries: ["makeup", "skincare", "beauty", "cream", "serum", "nail", "lip", "hair"] },
  { cat: "Kids", queries: ["toys", "kids", "baby", "children", "girl", "boy"] },
  { cat: "Sports", queries: ["sportswear", "fitness", "yoga", "gym", "cycling", "swimming"] },
  { cat: "Auto", queries: ["car", "motorcycle", "vehicle", "auto", "motor"] },
  { cat: "Home Improvement", queries: ["tools", "lamp", "light", "led", "drill", "screwdriver"] },
  { cat: "Computer", queries: ["laptop", "keyboard", "mouse", "tablet", "usb", "computer"] },
  { cat: "Men specific", queries: ["men jacket", "men shirt", "men pants", "hoodie men"] },
];

(async () => {
  for (const s of searches) {
    console.log(`\n=== ${s.cat} ===`);
    for (const q of s.queries) {
      const { rows } = await pool.query(
        `SELECT COUNT(*) as c FROM products WHERE main_image IS NOT NULL AND cost_usd > 0.5 AND title ILIKE $1`,
        [`%${q}%`]
      );
      const count = parseInt(rows[0].c);
      if (count > 0) {
        const { rows: sample } = await pool.query(
          `SELECT title, category FROM products WHERE main_image IS NOT NULL AND cost_usd > 0.5 AND title ILIKE $1 LIMIT 1`,
          [`%${q}%`]
        );
        console.log(`  ${count.toString().padStart(5)} "${q}" → ${sample[0].title.substring(0, 50)} [${sample[0].category.split(' > ')[0]}]`);
      } else {
        console.log(`  ${count.toString().padStart(5)} "${q}" → NO RESULTS`);
      }
    }
  }
  await pool.end();
})();
