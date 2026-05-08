const{Client}=require('pg');
(async()=>{
  const c=new Client({connectionString:'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'});
  await c.connect();
  const{rows}=await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  console.log(rows.length === 0 ? '✅ ZERO tabele — baza e 100% GOALĂ' : '⚠️ Tabele găsite: ' + rows.map(r=>r.tablename).join(', '));
  await c.end();
})();
