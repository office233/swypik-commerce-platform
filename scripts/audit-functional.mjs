/**
 * Audit functional READ-ONLY pe productie: verifica paginile si API-urile
 * cheie raspund corect. Nu creeaza date, nu modifica nimic (doar GET-uri
 * si POST-uri de cautare inofensive).
 */
const BASE = process.env.AUDIT_BASE || "https://swypik.com";

const checks = [
  // Pagini publice (HTML 200)
  { name: "home ro", path: "/ro", expect: 200 },
  { name: "home en", path: "/en", expect: 200 },
  { name: "explore", path: "/ro/explore", expect: 200 },
  { name: "cart", path: "/ro/cart", expect: 200 },
  { name: "cart redirect vechi", path: "/cart", expect: [200, 307, 308] },
  { name: "pay", path: "/ro/pay", expect: [200, 307] },
  { name: "go (ride)", path: "/ro/go", expect: [200, 307] },
  { name: "eats", path: "/ro/eats", expect: [200, 307] },
  { name: "stays", path: "/ro/stays", expect: [200, 307] },
  { name: "admin (protejat)", path: "/admin", expect: [200, 302, 307, 401, 403] },
  { name: "admin ae-cancel STERS", path: "/admin/ae-cancel", expect: [404, 307, 302] },

  // API-uri publice
  { name: "api explore feed", path: "/api/explore/feed?limit=1", expect: 200, json: true },
  { name: "api products", path: "/api/products?limit=1", expect: 200, json: true },
  { name: "api swyp rate", path: "/api/swyp/rate", expect: 200, json: true },
  { name: "api swyp supply", path: "/api/swyp/supply", expect: 200, json: true },
  { name: "api swyp earn-rules NOU", path: "/api/swyp/earn-rules", expect: 200, json: true },
  { name: "api health", path: "/api/health", expect: [200, 404] },

  // API-uri protejate: trebuie sa REFUZE fara auth
  { name: "api wallet fara auth", path: "/api/swyp/wallet", expect: [401, 403] },
  { name: "api withdraw fara auth", path: "/api/swyp/withdraw", method: "POST", body: {}, expect: [401, 403, 429] },
  { name: "api admin fara auth", path: "/api/admin/marketplace", expect: [401, 403, 302, 307] },
  { name: "api cron fara secret", path: "/api/cron/abandoned-cart", expect: [401, 403] },
  { name: "api checkout body gol", path: "/api/checkout", method: "POST", body: {}, expect: [400, 401, 422, 429] },

  // Chain
  { name: "scan.swypik.com", url: "https://scan.swypik.com/", expect: 200 },
];

let pass = 0, fail = 0;
const failures = [];

for (const c of checks) {
  const url = c.url || BASE + c.path;
  const expected = Array.isArray(c.expect) ? c.expect : [c.expect];
  try {
    const res = await fetch(url, {
      method: c.method || "GET",
      redirect: "manual",
      headers: c.body ? { "Content-Type": "application/json" } : {},
      body: c.body ? JSON.stringify(c.body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    let jsonOk = true;
    if (c.json && res.status === 200) {
      try { await res.json(); } catch { jsonOk = false; }
    }
    const ok = expected.includes(res.status) && jsonOk;
    if (ok) { pass++; console.log(`PASS  ${c.name} -> ${res.status}`); }
    else {
      fail++;
      failures.push(c.name);
      console.log(`FAIL  ${c.name} -> ${res.status}${jsonOk ? "" : " (JSON invalid)"} (asteptat ${expected.join("/")})`);
    }
  } catch (err) {
    fail++;
    failures.push(c.name);
    console.log(`FAIL  ${c.name} -> ${err.message}`);
  }
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
if (failures.length) console.log("Esecuri: " + failures.join(", "));
