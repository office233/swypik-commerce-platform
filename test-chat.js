// Test all categories + cart flow
async function testFlow() {
  const BASE = 'http://localhost:3001/api/chat';
  
  // Test 1: Category search (direct query)
  console.log('=== TEST 1: Category "Căști" ===');
  const r1 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Vreau căști wireless',
      sessionId: 'test-full',
      directCjQuery: 'wireless earbuds bluetooth headphones',
    }),
  }).then(r => r.json());
  
  console.log('Reply:', r1.reply);
  console.log('Products:', r1.products?.length || 0);
  if (r1.products?.[0]) {
    const p = r1.products[0];
    console.log('Source:', p.source);
    console.log('Title:', p.title?.substring(0, 60));
    console.log('Price:', p.price, 'RON');
    console.log('Images:', p.images?.length, '→', p.images?.[0]?.substring(0, 50));
    console.log('Rating:', p.rating, '| Orders:', p.orders);
    console.log('Delivery:', p.deliveryDays, 'zile');
  }

  // Test 2: Free text search (AI orchestrated)
  console.log('\n=== TEST 2: Free text "vreau ceas smart" ===');
  const r2 = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'vreau ceas smart',
      sessionId: 'test-full',
    }),
  }).then(r => r.json());
  
  console.log('Reply:', r2.reply);
  console.log('Products:', r2.products?.length || 0);
  if (r2.products?.[0]) {
    console.log('Source:', r2.products[0].source);
    console.log('Title:', r2.products[0].title?.substring(0, 60));
  }

  // Test 3: Cart API
  console.log('\n=== TEST 3: Cart API ===');
  if (r1.products?.[0]) {
    const cartRes = await fetch('http://localhost:3001/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        products: [r1.products[0]],
        customer: { name: 'Test', email: 'test@test.com', phone: '0700000000', address: 'Test 1', city: 'Cluj', county: 'Cluj' },
      }),
    }).then(r => r.json());
    console.log('Cart response:', JSON.stringify(cartRes).substring(0, 200));
  }

  console.log('\n✅ All tests done');
}

testFlow().catch(e => console.error('Error:', e.message));
