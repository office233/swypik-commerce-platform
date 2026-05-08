const {Pool}=require('pg');
const p=new Pool({host:'localhost',database:'aicevrei_products_cj',user:'postgres',password:'postgres'});
p.query("SELECT title, cost_usd, main_image FROM products WHERE pushed_to_shopify=true AND cost_usd>0 AND main_image LIKE 'http%' AND (LOWER(title) LIKE '%phone case%' OR LOWER(title) LIKE '%charger%' OR LOWER(title) LIKE '%power bank%') LIMIT 5").then(r=>{
  r.rows.forEach(x=>console.log(x.title.slice(0,55)+' | $'+x.cost_usd+' | '+x.main_image));
  p.end();
});
