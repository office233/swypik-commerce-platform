/**
 * Test script for ae_sdk - AliExpress Dropshipping SDK
 * 
 * Tests: library loading, client instantiation, API call structure
 * NOTE: Requires AE_APP_KEY, AE_APP_SECRET, AE_SESSION in .env.local
 */

const { DropshipperClient, AffiliateClient } = require('ae_sdk');
require('dotenv').config({ path: '.env.local' });

const APP_KEY = process.env.AE_APP_KEY;
const APP_SECRET = process.env.AE_APP_SECRET;
const SESSION = process.env.AE_SESSION;

async function test() {
  console.log('=== ae_sdk Test ===\n');

  // Test 1: Library loads
  console.log('✅ Library loaded successfully');
  console.log('   Exports: DropshipperClient, AffiliateClient\n');

  // Test 2: Check credentials
  if (!APP_KEY || !APP_SECRET) {
    console.log('⚠️  No AliExpress credentials found in .env.local');
    console.log('   Needed: AE_APP_KEY, AE_APP_SECRET, AE_SESSION');
    console.log('');
    console.log('   📋 Setup steps:');
    console.log('   1. Go to https://openservice.aliexpress.com/');
    console.log('   2. Register as developer');
    console.log('   3. Create app → get app_key + app_secret');
    console.log('   4. Generate access token (OAuth flow)');
    console.log('   5. Add to .env.local:');
    console.log('      AE_APP_KEY=your_key');
    console.log('      AE_APP_SECRET=your_secret');
    console.log('      AE_SESSION=your_access_token');
    console.log('');
    console.log('   Testing client instantiation anyway...\n');
  }

  // Test 3: Instantiate clients (even with fake creds for structure test)
  const testKey = APP_KEY || 'test_key';
  const testSecret = APP_SECRET || 'test_secret';
  const testSession = SESSION || 'test_session';

  try {
    const dsClient = new DropshipperClient({
      app_key: testKey,
      app_secret: testSecret,
      session: testSession,
    });
    console.log('✅ DropshipperClient instantiated');
    console.log('   Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(dsClient)).filter(m => m !== 'constructor').join(', '));

    const affClient = new AffiliateClient({
      app_key: testKey,
      app_secret: testSecret,
      session: testSession,
    });
    console.log('✅ AffiliateClient instantiated');
    console.log('   Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(affClient)).filter(m => m !== 'constructor').join(', '));
  } catch (err) {
    console.log('❌ Client instantiation failed:', err.message);
  }

  // Test 4: If we have real credentials, do a live API test
  if (APP_KEY && APP_SECRET && SESSION) {
    console.log('\n--- Live API Tests ---\n');
    
    const dsClient = new DropshipperClient({
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      session: SESSION,
    });

    // Test: Get product details for a known AliExpress product
    const testProductId = 1005006839821070; // Popular wireless earbuds
    console.log(`🔍 Testing productDetails (ID: ${testProductId})...`);
    try {
      const result = await dsClient.productDetails({
        product_id: testProductId,
        ship_to_country: 'RO',
        target_currency: 'USD',
        target_language: 'en',
      });
      if (result.ok) {
        const p = result.data.aliexpress_ds_product_get_response.result;
        console.log('✅ Product found!');
        console.log(`   Title: ${p.ae_item_base_info_dto?.subject}`);
        console.log(`   Price: ${p.ae_item_sku_info_dtos?.[0]?.offer_sale_price} ${p.ae_item_sku_info_dtos?.[0]?.currency_code}`);
        console.log(`   SKUs: ${p.ae_item_sku_info_dtos?.length}`);
      } else {
        console.log('⚠️  Product not found:', result.message);
      }
    } catch (err) {
      console.log('❌ productDetails failed:', err.message);
    }

    // Test: Shipping to Romania
    console.log(`\n📦 Testing shippingInfo (to RO)...`);
    try {
      const shippingResult = await dsClient.shippingInfo({
        country_code: 'RO',
        product_id: testProductId,
        product_num: 1,
        send_goods_country_code: 'CN',
      });
      if (shippingResult.ok) {
        const freightData = shippingResult.data.aliexpress_logistics_buyer_freight_calculate_response;
        console.log('✅ Shipping info received!');
        if (freightData?.result?.aeop_freight_calculate_result_for_buyer_d_t_o_list) {
          const options = freightData.result.aeop_freight_calculate_result_for_buyer_d_t_o_list;
          console.log(`   ${options.length} shipping options to RO:`);
          options.forEach(opt => {
            console.log(`   - ${opt.service_name}: ${opt.freight?.amount || 'N/A'} ${opt.freight?.currency_code || ''} (${opt.estimated_delivery_time || '?'} days)`);
          });
        }
      } else {
        console.log('⚠️  No shipping to RO:', shippingResult.message);
      }
    } catch (err) {
      console.log('❌ shippingInfo failed:', err.message);
    }

    // Test: Affiliate hot products
    console.log(`\n🔥 Testing getHotProducts...`);
    const affClient = new AffiliateClient({
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      session: SESSION,
    });
    try {
      const hotResult = await affClient.getHotProducts({
        keywords: 'wireless earbuds',
        page_no: 1,
        page_size: 5,
        ship_to_country: 'RO',
        target_currency: 'USD',
        target_language: 'EN',
        sort: 'SALE_PRICE_ASC',
      });
      if (hotResult.ok) {
        console.log('✅ Hot products found!');
        const products = hotResult.data?.aliexpress_affiliate_hotproduct_query_response?.resp_result?.result?.products || [];
        products.forEach(p => {
          console.log(`   - ${p.product_title} | ${p.target_sale_price} ${p.target_sale_price_currency}`);
        });
      } else {
        console.log('⚠️  Hot products failed:', hotResult.message);
      }
    } catch (err) {
      console.log('❌ getHotProducts failed:', err.message);
    }
  }

  console.log('\n=== Test Complete ===');
}

test().catch(console.error);
