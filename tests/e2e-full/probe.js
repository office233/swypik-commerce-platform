const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const path of ['/explore', '/go']) {
    console.log('===', path);
    p.removeAllListeners('response');
    p.removeAllListeners('console');
    p.on('response', (r) => { if (r.status() >= 400) console.log('REQ', r.status(), r.url()); });
    p.on('console', (m) => { if (m.type() === 'error') console.log('CON', m.text().slice(0, 160)); });
    await p.goto('https://swypik.com' + path, { waitUntil: 'networkidle' }).catch(e => console.log('NAV', e.message));
  }
  await b.close();
})();
