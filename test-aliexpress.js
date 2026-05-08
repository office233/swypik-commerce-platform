/**
 * AliExpress DataHub - Endpoint Discovery Test
 * Finding correct endpoint names and response structures
 */
const API_KEY = '6174354e18msheb623277344c24ap177094jsnd7be6b0c2cdd';
const API_HOST = 'aliexpress-datahub.p.rapidapi.com';
const headers = { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST };

async function tryEndpoint(name, url) {
  try {
    const res = await fetch(`https://${API_HOST}${url}`, { headers });
    const data = await res.json();
    const status = data.result?.status?.code || res.status;
    const hasData = JSON.stringify(data).length;
    console.log(`${status === 200 ? '✅' : '⚠️ '} ${name} [${status}] (${hasData} bytes)`);
    if (status === 200) {
      console.log(`   Response keys: ${JSON.stringify(data.result ? Object.keys(data.result) : Object.keys(data)).substring(0, 200)}`);
    }
    return { name, data, status };
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    return null;
  }
}

async function test() {
  console.log('=== Endpoint Discovery ===\n');

  // Search endpoints
  console.log('--- SEARCH ---');
  await tryEndpoint('Search #2', '/item_search_2?q=wireless+earbuds&page=1');
  await tryEndpoint('Search #3', '/item_search_3?q=wireless+earbuds&page=1');
  await tryEndpoint('Search #4', '/item_search_4?q=wireless+earbuds&page=1');
  await tryEndpoint('Search #5', '/item_search_5?q=wireless+earbuds&page=1');

  // Product details
  console.log('\n--- PRODUCT DETAILS ---');
  const d2 = await tryEndpoint('Detail #2', '/item_detail_2?itemId=1005007686681904');
  const d3 = await tryEndpoint('Detail #3', '/item_detail_3?itemId=1005007686681904');
  const d6 = await tryEndpoint('Detail #6', '/item_detail_6?itemId=1005007686681904');

  // Print one good detail
  for (const d of [d6, d3, d2]) {
    if (d && d.status === 200) {
      const r = d.data.result;
      console.log(`\n   📦 Best detail endpoint: ${d.name}`);
      const item = r.item || r;
      console.log(`   Title: ${item.title}`);
      console.log(`   Images: ${JSON.stringify((item.images || []).slice(0, 2))}`);
      const skus = r.skuInfo?.skuList || item.skuList || [];
      console.log(`   SKUs: ${skus.length}`);
      if (skus[0]) console.log(`   First SKU price: ${JSON.stringify(skus[0].skuVal?.skuAmount || skus[0])?.substring(0, 100)}`);
      break;
    }
  }

  // Shipping
  console.log('\n--- SHIPPING ---');
  await tryEndpoint('Shipping #2', '/item_shipping_2?itemId=1005007686681904&country=RO&quantity=1');
  await tryEndpoint('Shipping #3', '/item_shipping_3?itemId=1005007686681904&country=RO&quantity=1');
  await tryEndpoint('Shipping #4', '/item_shipping_4?itemId=1005007686681904&country=RO&quantity=1');
  const s5 = await tryEndpoint('Shipping #5', '/item_shipping_5?itemId=1005007686681904&country=RO&quantity=1');
  
  // Print shipping data
  for (const s of [s5]) {
    if (s && s.status === 200) {
      console.log(`\n   🚚 Shipping data sample:`);
      console.log(`   ${JSON.stringify(s.data.result).substring(0, 500)}`);
      break;
    }
  }

  // Description
  console.log('\n--- DESCRIPTION ---');
  await tryEndpoint('Desc #1', '/item_desc?itemId=1005007686681904');
  await tryEndpoint('Desc #2', '/item_desc_2?itemId=1005007686681904');

  // Categories
  console.log('\n--- CATEGORIES ---');
  const cats = await tryEndpoint('Categories', '/categories');
  if (cats && cats.status === 200) {
    const catList = cats.data.result?.categories || cats.data.result;
    if (Array.isArray(catList)) {
      console.log(`   Found ${catList.length} categories. First 5:`);
      catList.slice(0, 5).forEach(c => console.log(`   - ${c.name || c.title} (ID: ${c.id || c.catId})`));
    }
  }

  console.log('\n=== Done ===');
}

test().catch(console.error);
