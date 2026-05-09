const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

async function fixCategories() {
  const c = new Client(NEON_URL);
  await c.connect();

  console.log("Inserăm categoriile de bază (level 1)...");
  await c.query(`
    INSERT INTO ae_categories (ae_category_id, name, name_ro, level, is_active) VALUES 
    (100003109, 'Women''s Clothing', 'Îmbrăcăminte Femei', 1, true),
    (100003070, 'Men''s Clothing', 'Îmbrăcăminte Bărbați', 1, true),
    (32004, 'Weddings & Events', 'Nunți & Evenimente', 1, true),
    (1501, 'Mother & Kids', 'Mamă & Copil', 1, true),
    (3, 'Apparel Accessories', 'Accesorii Vestimentare', 1, true),
    (1503, 'Furniture', 'Mobilier', 1, true),
    (34, 'Automobiles & Motorcycles', 'Auto, Piese & Accesorii', 1, true)
    ON CONFLICT (ae_category_id) DO UPDATE SET is_active = true;
  `);

  console.log("Corectăm parent_id pentru subcategoriile orfane...");
  // Știm că aproape tot ce s-a importat acum e haine femei și rochii de nuntă.
  // Din fișierele: lenjerie_femei, formalevening, weedingparty etc.
  
  // Rochii de seară / nunți (Weddings & Events) - ae_category_id = 32004
  await c.query(`UPDATE ae_categories SET parent_id = 32004 WHERE ae_category_id IN (100005788, 100005791, 100005792, 100005793, 201530702) OR name_ro ILIKE '%Mireasă%' OR name_ro ILIKE '%Bal%';`);
  
  // Restul hainelor merg la Femei - ae_category_id = 100003109
  // Tot ce e Pijamale, Topuri, Costume, Bikini etc.
  const { rowCount } = await c.query(`
    UPDATE ae_categories 
    SET parent_id = 100003109 
    WHERE level = 2 AND parent_id IS NULL AND ae_category_id NOT IN (100005788, 100005791, 100005792, 100005793, 201530702);
  `);
  console.log(`Updated ${rowCount} orphan categories to Women's Clothing.`);

  console.log("Status nou pe level 1:");
  const { rows } = await c.query(`
    SELECT c.name_ro, COALESCE(direct.cnt, 0) + COALESCE(child.cnt, 0) as total_products
    FROM ae_categories c
    LEFT JOIN (SELECT category_id, COUNT(*) as cnt FROM ae_products GROUP BY category_id) direct ON direct.category_id = c.ae_category_id
    LEFT JOIN (SELECT sub.parent_id, SUM(pc.cnt) as cnt FROM ae_categories sub JOIN (SELECT category_id, COUNT(*) as cnt FROM ae_products GROUP BY category_id) pc ON pc.category_id = sub.ae_category_id WHERE sub.parent_id IS NOT NULL GROUP BY sub.parent_id) child ON child.parent_id = c.ae_category_id
    WHERE c.level = 1 AND (COALESCE(direct.cnt, 0) + COALESCE(child.cnt, 0)) > 0
    ORDER BY total_products DESC;
  `);
  
  rows.forEach(r => console.log(`${r.name_ro}: ${r.total_products} produse`));

  await c.end();
}

fixCategories().catch(console.error);
