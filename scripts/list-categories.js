const { Pool } = require("pg");
const pool = new Pool({ 
  connectionString: "postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require", 
  ssl: { rejectUnauthorized: false } 
});

(async () => {
  const { rows: top } = await pool.query(`
    SELECT SPLIT_PART(category, ' > ', 1) as cat, COUNT(*) as c 
    FROM products WHERE main_image IS NOT NULL AND cost_usd > 0.5
    GROUP BY SPLIT_PART(category, ' > ', 1) ORDER BY c DESC
  `);
  console.log("=== TOP-LEVEL CATEGORIES ===");
  for (const r of top) console.log("  " + r.c.toString().padStart(6) + "  " + r.cat);

  const { rows: sub } = await pool.query(`
    SELECT SPLIT_PART(category, ' > ', 1) as parent, SPLIT_PART(category, ' > ', 2) as sub, COUNT(*) as c 
    FROM products WHERE main_image IS NOT NULL AND cost_usd > 0.5 AND category LIKE '%>%'
    GROUP BY parent, sub ORDER BY parent, c DESC
  `);
  console.log("\n=== SUB-CATEGORIES (top 5 per parent) ===");
  let lastParent = "";
  let subCount = 0;
  for (const r of sub) {
    if (r.parent !== lastParent) { lastParent = r.parent; subCount = 0; console.log("\n  " + r.parent + ":"); }
    if (subCount < 5) { console.log("    " + r.c.toString().padStart(5) + "  " + r.sub); subCount++; }
  }

  await pool.end();
})();
