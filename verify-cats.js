const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function verify() {
  const c = new Client(NEON_URL);
  await c.connect();

  console.log('--- EȘANTION PRODUSE (Primele 10) ---');
  const { rows: prods } = await c.query(`
    SELECT p.title, p.category_id, c.name_ro as sub_category, parent.name_ro as main_category
    FROM ae_products p
    LEFT JOIN ae_categories c ON p.category_id = c.ae_category_id
    LEFT JOIN ae_categories parent ON c.parent_id = parent.ae_category_id
    LIMIT 10;
  `);
  
  prods.forEach(p => {
    console.log(`Produs: ${p.title.slice(0, 30)}...`);
    console.log(`  -> Subcategorie: [${p.category_id}] ${p.sub_category}`);
    console.log(`  -> Categoria Principală: ${p.main_category || 'LIPSEȘTE (ORFAN!)'}\n`);
  });

  console.log('--- VERIFICARE ORFAJ ---');
  const { rows: orphans } = await c.query(`
    SELECT COUNT(*) as cnt 
    FROM ae_products p 
    LEFT JOIN ae_categories c ON p.category_id = c.ae_category_id 
    WHERE c.parent_id IS NULL AND c.level = 2;
  `);
  console.log(`Produse în subcategorii orfane: ${orphans[0].cnt}`);

  const { rows: noCategory } = await c.query(`
    SELECT COUNT(*) as cnt 
    FROM ae_products 
    WHERE category_id IS NULL;
  `);
  console.log(`Produse fără nicio categorie: ${noCategory[0].cnt}`);

  await c.end();
}

verify().catch(console.error);
