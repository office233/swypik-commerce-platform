#!/usr/bin/env node
/**
 * Crawl toate paginile publice (ro + en) și raportează:
 *  - status != 200
 *  - "undefined" vizibil în HTML
 *  - chei i18n brute (ex: explore.someKey) în HTML
 * Utilizare: node scripts/crawl-pages.mjs [baseUrl]  (default http://127.0.0.1:3005)
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:3005";
const LOCALES = ["ro", "en"];

// Descoperă rutele statice din app/[locale]
function discoverRoutes() {
  const root = path.join("app", "[locale]");
  const routes = new Set(["/"]);
  function walk(dir, url) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith("_") || name.startsWith("(")) {
        if (name.startsWith("(")) walk(path.join(dir, name), url); // route group
        continue;
      }
      if (name.startsWith("[")) continue; // rute dinamice — sărite (au nevoie de ID-uri)
      const next = `${url}/${name}`;
      const p = path.join(dir, name);
      if (fs.existsSync(path.join(p, "page.tsx")) || fs.existsSync(path.join(p, "page.ts"))) routes.add(next);
      walk(p, next);
    }
  }
  walk(root, "");
  return [...routes].sort();
}

// heuristic chei brute: namespace.camelCaseKey (cheile reale au camelCase; domeniile nu)
const RAW_KEY_RE = /\b[a-z][a-zA-Z]+\.[a-z]+[A-Z][a-zA-Z]{3,}\b/;
const SKIP_KEY_PAT = /\.(js|css|svg|png|jpg|webp|json|com|ro|net|org|io|app|min|dev|eu|info)\b|next\.|window\.|document\.|www\.|ec\.|scan\.|api\./;

async function check(url) {
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "swypik-crawl" }, signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    const problems = [];
    if (res.status !== 200) problems.push(`status=${res.status}`);
    // "undefined" vizibil în text (nu în scripturi)
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
    if (/>[^<]*\bundefined\b[^<]*</.test(visible)) problems.push("'undefined' vizibil");
    if (/>[^<]*\bNaN\b[^<]*</.test(visible)) problems.push("'NaN' vizibil");
    // chei i18n brute vizibile
    const textOnly = visible.replace(/<[^>]+>/g, " ");
    const m = textOnly.match(RAW_KEY_RE);
    if (m && !SKIP_KEY_PAT.test(m[0])) problems.push(`cheie brută? '${m[0]}'`);
    return { url, status: res.status, problems };
  } catch (e) {
    return { url, status: 0, problems: [`fetch error: ${e.message}`] };
  }
}

const routes = discoverRoutes();
console.log(`Rute descoperite: ${routes.length} × ${LOCALES.length} limbi = ${routes.length * LOCALES.length} pagini pe ${BASE}\n`);

const urls = [];
for (const locale of LOCALES) for (const r of routes) urls.push(`${BASE}/${locale}${r === "/" ? "" : r}`);

const results = [];
const CONCURRENCY = 8;
for (let i = 0; i < urls.length; i += CONCURRENCY) {
  const batch = await Promise.all(urls.slice(i, i + CONCURRENCY).map(check));
  results.push(...batch);
  process.stdout.write(`\r${Math.min(i + CONCURRENCY, urls.length)}/${urls.length}`);
}
console.log();

const bad = results.filter(r => r.problems.length);
const lines = [
  `# CRAWL REPORT — ${new Date().toISOString()}`,
  `Base: ${BASE} | Pagini: ${results.length} | OK: ${results.length - bad.length} | Probleme: ${bad.length}`,
  "",
  "| URL | Status | Probleme |",
  "|---|---|---|",
  ...bad.map(r => `| ${r.url} | ${r.status} | ${r.problems.join("; ")} |`),
];
fs.writeFileSync("docs/CRAWL_REPORT.md", lines.join("\n") + "\n");
console.log(`OK: ${results.length - bad.length}/${results.length}; probleme: ${bad.length} -> docs/CRAWL_REPORT.md`);
for (const r of bad.slice(0, 20)) console.log(" ✗", r.url, r.problems.join("; "));
process.exit(bad.length ? 1 : 0);
