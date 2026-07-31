// Audit i18n: chei lipsă, valori netraduse (identice cu RO), chei orfane, chei nefolosite.
import fs from "node:fs";
import path from "node:path";

const LOCALES = ["ro", "en", "es", "fr", "de", "pt", "it"];
const load = (l) => JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8"));

const flat = (o, p = "") => {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flat(v, key));
    else out[key] = v;
  }
  return out;
};

const M = Object.fromEntries(LOCALES.map((l) => [l, flat(load(l))]));
const roKeys = Object.keys(M.ro);

console.log("=== 1. CHEI LIPSĂ (există în ro, lipsesc în altă limbă) ===");
const missingByLocale = {};
for (const l of LOCALES.filter((x) => x !== "ro")) {
  const miss = roKeys.filter((k) => !(k in M[l]));
  missingByLocale[l] = miss;
  console.log(`${l}: ${miss.length}`);
}
const allMissing = [...new Set(Object.values(missingByLocale).flat())].sort();
console.log(`\nchei distincte lipsă undeva: ${allMissing.length}`);
console.log(allMissing.slice(0, 60).join("\n"));
if (allMissing.length > 60) console.log(`... +${allMissing.length - 60}`);

console.log("\n=== 2. NETRADUSE (valoare identică cu RO, deși RO are diacritice/cuvinte RO) ===");
const roWordy = (v) =>
  typeof v === "string" && (/[ăâîșț]/i.test(v) || /\b(și|sau|pentru|este|nu|tău|tau|cu|de la|acum)\b/i.test(v));
for (const l of LOCALES.filter((x) => x !== "ro" && x !== "en")) {
  const same = roKeys.filter((k) => k in M[l] && M[l][k] === M.ro[k] && roWordy(M.ro[k]));
  console.log(`${l}: ${same.length} netraduse`);
  if (same.length) console.log("   ex: " + same.slice(0, 5).join(", "));
}
{
  const same = roKeys.filter((k) => k in M.en && M.en[k] === M.ro[k] && roWordy(M.ro[k]));
  console.log(`en: ${same.length} netraduse`);
  if (same.length) console.log("   ex: " + same.slice(0, 5).join(", "));
}

console.log("\n=== 3. CHEI ORFANE (există în altă limbă, nu în ro) ===");
for (const l of LOCALES.filter((x) => x !== "ro")) {
  const extra = Object.keys(M[l]).filter((k) => !(k in M.ro));
  if (extra.length) console.log(`${l}: ${extra.length} -> ${extra.slice(0, 10).join(", ")}`);
}

console.log("\n=== 4. NAMESPACE-URI NEFOLOSITE ÎN COD ===");
const srcFiles = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (/node_modules|\.next/.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(p);
  }
};
["app", "components", "lib"].forEach(walk);
const allSrc = srcFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
const namespaces = Object.keys(load("ro"));
const unused = namespaces.filter(
  (ns) => !new RegExp(`["'\`]${ns}["'\`\\.]|namespace:\\s*["']${ns}["']`).test(allSrc),
);
console.log(`namespaces totale: ${namespaces.length}, nefolosite: ${unused.length}`);
console.log(unused.join(", "));

fs.writeFileSync(
  "i18n-audit.json",
  JSON.stringify({ missingByLocale, allMissing, unusedNamespaces: unused }, null, 2),
);
console.log("\n-> i18n-audit.json scris");
