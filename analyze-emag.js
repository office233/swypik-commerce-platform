const fs = require('fs');
const html = fs.readFileSync('d:/Aicevrei/emag-debug.html','utf8');

// Find product-new-price context
const priceRegex = /product-new-price[\s\S]{0,200}/g;
const matches = html.match(priceRegex);
if(matches) {
  console.log('Price contexts (first 5):');
  matches.slice(0,5).forEach((m,i) => {
    console.log(`\n--- Match ${i+1} ---`);
    console.log(m.replace(/\s+/g,' ').slice(0,180));
  });
}

// Find card-v2-title
const titleRegex = /card-v2-title[\s\S]{0,300}/g;
const titles = html.match(titleRegex);
if(titles) {
  console.log('\n\nTitle contexts (first 3):');
  titles.slice(0,3).forEach((t,i) => {
    console.log(`\n--- Title ${i+1} ---`);
    console.log(t.replace(/\s+/g,' ').slice(0,200));
  });
}
