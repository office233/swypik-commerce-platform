const fs = require('fs');
const path = require('path');

const downloadsDir = 'C:\\Users\\Pos5\\Downloads';
const files = fs.readdirSync(downloadsDir).filter(f => f.startsWith('aicevrei_') && f.endsWith('.json'));

let allIds = new Set();

for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(downloadsDir, file), 'utf8'));
    if (data.product_ids && Array.isArray(data.product_ids)) {
      data.product_ids.forEach(id => allIds.add(id.toString()));
    } else if (Array.isArray(data)) {
      data.forEach(item => {
        if (item.productId) allIds.add(item.productId.toString());
      });
    }
  } catch (e) {
    console.error('Error reading', file, e.message);
  }
}

const idsArray = [...allIds];
fs.writeFileSync('d:\\swypik\\all-ae-ids.txt', idsArray.join('\n'));
console.log(`Successfully extracted ${idsArray.length} unique AliExpress product IDs.`);
