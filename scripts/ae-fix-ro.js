const{Client}=require('pg');
(async()=>{
  const c=new Client({connectionString:'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'});
  await c.connect();
  // Set name_ro = name for any still NULL (fallback to English)
  await c.query("UPDATE ae_categories SET name_ro = name WHERE name_ro IS NULL");
  const{rows}=await c.query('SELECT COUNT(*) as total, COUNT(name_ro) as with_ro FROM ae_categories');
  console.log(`✅ ${rows[0].total} categorii, toate cu name_ro setat (${rows[0].with_ro})`);
  // Sample
  const{rows:s}=await c.query("SELECT name, name_ro FROM ae_categories WHERE level=1 ORDER BY name");
  s.forEach(r=>console.log(`  ${r.name} → ${r.name_ro}`));
  await c.end();
})();
