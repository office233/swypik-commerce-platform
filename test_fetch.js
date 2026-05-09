const https = require('https');
const fs = require('fs');

const url = 'https://www.aliexpress.com/item/1005009926657110.html';
https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('test_product.html', data);
    console.log('Saved to test_product.html. Length:', data.length);
  });
});
