const r = require('./artifacts/results.json');
const s = JSON.stringify(r);
const m = s.match(/\d{3} https:[^\\"]{0,150}/g) || [];
[...new Set(m)].slice(0, 20).forEach((x) => console.log(x));
