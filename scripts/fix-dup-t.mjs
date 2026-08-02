#!/usr/bin/env node
/**
 * Repară `const t` duplicat injectat de extract-i18n-strings:
 * redenumește declarația injectată (indent 2 spații) în `tx` și
 * rescrie apelurile t("cheie") -> tx("cheie") pentru cheile care există
 * DOAR în namespace-ul injectat (nu și în cel original).
 */
import fs from "node:fs";

const ro = JSON.parse(fs.readFileSync("messages/ro.json", "utf8"));
const files = process.argv.slice(2);

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  const lines = s.split(/\r?\n/);
  // găsește perechea: linie injectată (2 spații) urmată/precedată de una originală (4 spații)
  const injRe = /^ {2}const t = (await getTranslations|useTranslations)\("([^"]+)"\)/;
  const origRe = /^\s{4,}const t = (await getTranslations|useTranslations)\("([^"]+)"\)/;
  let injNs = null, origNs = null, injIdx = -1;
  lines.forEach((l, i) => {
    const mi = l.match(injRe);
    if (mi) { injNs = mi[2]; injIdx = i; }
    const mo = l.match(origRe);
    if (mo) origNs = mo[2];
  });
  if (injIdx < 0) { console.log("skip (no inj):", f); continue; }
  lines[injIdx] = lines[injIdx].replace("const t =", "const tx =");
  s = lines.join("\n");
  const injKeys = Object.keys(ro[injNs] || {});
  const origKeys = new Set(Object.keys(origNs ? ro[origNs] || {} : {}));
  let n = 0;
  for (const k of injKeys) {
    if (origKeys.has(k)) continue; // ambiguu — lasă t()
    const re = new RegExp(`(?<![A-Za-z0-9_.])t\\("${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g");
    s = s.replace(re, (m) => { n++; return "tx(\"" + k + "\""; });
  }
  fs.writeFileSync(f, s);
  console.log(`fixed ${f}: ns=${injNs} renamed, ${n} apeluri -> tx()`);
}
