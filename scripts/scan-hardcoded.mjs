#!/usr/bin/env node
/**
 * scan-hardcoded — numără textele de interfață hardcodate (netraduse) din
 * componentele client și paginile din `app/` și `components/`.
 *
 * Folosit de scripts/i18n-guard.mjs (pre-commit): commit-ul e blocat doar dacă
 * numărul CREȘTE față de `.i18n-baseline.json` — hardcodările istorice sunt
 * tolerate, cele noi nu. Ieșire: `files: N hits: M` + primele potriviri.
 *
 * Ce numără: text JSX între tag-uri (`>Text<`), atributele placeholder/title/
 * aria-label/alt și `alert("...")`, dacă textul conține diacritice românești
 * SAU un cuvânt românesc frecvent. Ce ignoră: className, import-uri,
 * comentarii, fișierele de test și `messages/`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components"];
const EXT = new Set([".tsx"]);
const DIACRITICS = /[ăâîșțĂÂÎȘȚ]/;
const RO_WORDS = /\b(și|sau|pentru|din|este|sunt|acum|aici|către|fără|după|până|cumpără|adaugă|caută|trimite|salvează|închide|deschide|înapoi|următorul|comandă|coș|preț|reducere|livrare|client|clienți|factură|facturi|vânzare|vânzări|produs|produse)\b/i;
const IGNORE_DIRS = new Set(["node_modules", ".next", "tests", "__tests__"]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(entry.name)) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
}

function looksRomanian(text) {
  const t = text.trim();
  if (t.length < 3) return false;
  return DIACRITICS.test(t) || RO_WORDS.test(t);
}

const PATTERNS = [
  /(?<=>)[^<>{}\n]*[A-Za-zăâîșțĂÂÎȘȚ]{3,}[^<>{}\n]*(?=<)/g,   // text JSX
  /(?:placeholder|title|aria-label|alt)="([^"]{3,})"/g,     // atribute
  /alert\("([^"]{3,})"\)/g,                                  // alert()
];

const files = [];
for (const root of ROOTS) if (fs.existsSync(root)) walk(root, files);

let hits = 0;
const samples = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, idx) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /className=|from ["']/.test(line) && !/>[^<]+</.test(line)) return;
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const text = m[1] ?? m[0];
        if (!looksRomanian(text)) continue;
        hits++;
        if (samples.length < 30) samples.push(`${file.replace(/\\/g, "/")}:${idx + 1}: ${text.trim().slice(0, 70)}`);
      }
    }
  });
}

console.log(`files: ${files.length} hits: ${hits}`);
for (const s of samples) console.log("  " + s);
