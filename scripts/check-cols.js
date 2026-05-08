const {Client}=require('pg');
async function main() {
  const c = new Client({connectionString:'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require'});
  await c.connect();
  
  // Simulate the exact API query
  const id = '1005008264161390';
  const {rows: products} = await c.query(
    `SELECT p.*, c.name as category_name, c.parent_id as parent_category_id
     FROM ae_products p
     LEFT JOIN ae_categories c ON c.ae_category_id = p.category_id
     WHERE p.ae_product_id = $1 OR p.id = $2`,
    [id, isNaN(Number(id)) ? 0 : Number(id)]
  );
  
  if (!products.length) {
    console.log('NOT FOUND');
  } else {
    console.log('FOUND:', products[0].title);
    console.log('category_name:', products[0].category_name);
    console.log('images type:', typeof products[0].images, Array.isArray(products[0].images));
    console.log('images:', JSON.stringify(products[0].images?.slice(0,2)));
  }
  
  await c.end();
}
main().catch(e => { console.log('ERR:', e.message); process.exit(1); });
