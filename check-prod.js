// Quick script to verify production deployment
fetch('https://aicevrei.ro/api/products?mode=video&limit=2&sort=popular')
  .then(r => r.json())
  .then(d => {
    console.log('=== Production API Check ===');
    console.log('Total audio-only clips:', d.total);
    console.log('Products returned:', d.products?.length);
    if (d.products?.[0]) {
      const p = d.products[0];
      console.log('First product:', p.title?.substring(0, 50));
      console.log('Has video:', !!p.video);
      console.log('Video URL:', p.video?.substring(0, 60));
    }
    console.log('=== Feed should work with', d.total, 'audio clips ===');
  })
  .catch(e => console.error('API Error:', e.message));
