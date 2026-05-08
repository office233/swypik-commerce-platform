/**
 * Fix TVA 19% → 21% pe TOATE produsele existente
 * Recalculează price_ron + old_price_ron
 */
const { Client } = require('pg');
const NEON_URL = 'postgresql://neondb_owner:npg_SPahbB68xqur@ep-cold-hat-alaqlcr5.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require';

function calculatePriceRON(costUsd, shipUsd) {
  const totalRon = (costUsd + shipUsd) * 4.55 * 1.21; // TVA 21%
  const mk = costUsd < 3 ? 2.0 : (costUsd < 50 ? 1.5 : 1.3);
  const raw = totalRon * mk;
  const pts = [14,19,24,29,39,49,59,69,79,89,99,119,129,149,169,189,199,219,249,269,299,349,399,449,499,599,699,799,899,999];
  const price = pts.find(p => p >= raw) || Math.ceil(raw / 100) * 100 - 1;
  const oldMul = 1.6 + (Math.abs(Math.round(costUsd * 100)) % 30) / 100;
  const oldPrice = pts.find(p => p >= price * oldMul) || Math.ceil(price * oldMul / 10) * 10 - 1;
  return { price, oldPrice, markup: mk };
}

(async () => {
  const db = new Client({ connectionString: NEON_URL });
  await db.connect();

  const { rows } = await db.query('SELECT ae_product_id, min_price_usd, ship_cost_usd FROM ae_products');
  console.log(`Recalculez ${rows.length} produse cu TVA 21%...`);

  for (const r of rows) {
    const { price, oldPrice, markup } = calculatePriceRON(parseFloat(r.min_price_usd), parseFloat(r.ship_cost_usd || 0));
    await db.query('UPDATE ae_products SET price_ron = $1, old_price_ron = $2, markup = $3 WHERE ae_product_id = $4',
      [price, oldPrice, markup, r.ae_product_id]);
  }

  // Also update variants
  const { rows: vars } = await db.query('SELECT v.product_id, v.sku_id, v.price_usd, p.ship_cost_usd FROM ae_variants v JOIN ae_products p ON p.ae_product_id = v.product_id');
  for (const v of vars) {
    const { price } = calculatePriceRON(parseFloat(v.price_usd), parseFloat(v.ship_cost_usd || 0));
    await db.query('UPDATE ae_variants SET price_ron = $1 WHERE product_id = $2 AND sku_id = $3', [price, v.product_id, v.sku_id]);
  }

  // Show sample
  const { rows: sample } = await db.query('SELECT title, min_price_usd, price_ron, old_price_ron FROM ae_products ORDER BY price_ron LIMIT 10');
  console.log('\nProduse recalculate (TVA 21%):');
  sample.forEach(s => console.log(`  $${s.min_price_usd} → ${s.price_ron} RON (era ${s.old_price_ron}) — ${s.title.slice(0,40)}`));

  console.log(`\n✅ ${rows.length} produse + ${vars.length} variante recalculate!`);
  await db.end();
})();
