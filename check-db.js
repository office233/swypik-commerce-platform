const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function checkStatus() {
  const c = new Client(NEON_URL);
  await c.connect();

  console.log('--- STATUS GENERAL BAZA DE DATE ---');
  const { rows: prodCount } = await c.query('SELECT count(*) FROM ae_products');
  console.log(`TOTAL Produse: ${prodCount[0].count}`);

  console.log('\n--- DISTRIBUȚIE PE CATEGORII (Level 1) ---');
  const catQuery = `
    SELECT c.name_ro, c.name, c.ae_category_id, COUNT(p.id) as cnt 
    FROM ae_categories c 
    LEFT JOIN ae_products p ON p.category_id = c.ae_category_id 
    WHERE c.level = 1 
    GROUP BY c.name_ro, c.name, c.ae_category_id 
    ORDER BY cnt DESC 
    LIMIT 20;
  `;
  const { rows: cats } = await c.query(catQuery);
  cats.forEach(r => console.log(`[${r.ae_category_id}] ${r.name_ro}: ${r.cnt} produse`));

  console.log('\n--- DISTRIBUȚIE PE SUBCATEGORII (Level 2) ---');
  const subCatQuery = `
    SELECT parent.name_ro as parent_name, sub.name_ro as sub_name, sub.ae_category_id, COUNT(p.id) as cnt 
    FROM ae_categories sub 
    LEFT JOIN ae_categories parent ON sub.parent_id = parent.ae_category_id
    LEFT JOIN ae_products p ON p.category_id = sub.ae_category_id 
    WHERE sub.level = 2 
    GROUP BY parent.name_ro, sub.name_ro, sub.ae_category_id 
    HAVING COUNT(p.id) > 0
    ORDER BY cnt DESC 
    LIMIT 20;
  `;
  const { rows: subcats } = await c.query(subCatQuery);
  subcats.forEach(r => console.log(`[${r.parent_name} -> ${r.sub_name}]: ${r.cnt} produse`));

  console.log('\n--- ULTIMELE 5 PRODUSE IMPORTATE ---');
  const latestQuery = `
    SELECT title, price_ron, category_id, created_at 
    FROM ae_products 
    ORDER BY created_at DESC 
    LIMIT 5;
  `;
  const { rows: latest } = await c.query(latestQuery);
  latest.forEach(r => console.log(`- ${r.title.slice(0, 40)}... | Categ: ${r.category_id} | ${r.price_ron} RON | ${r.created_at}`));

  await c.end();
}

checkStatus().catch(console.error);
