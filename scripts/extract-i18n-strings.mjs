#!/usr/bin/env node
/**
 * Extrage stringuri RO hardcodate din fișiere TSX/TS, le mapează la chei i18n,
 * și opțional rescrie fișierul folosind useTranslations().
 *
 * Două moduri:
 *   --report      : doar listează ce ar extrage (default)
 *   --apply       : modifică fișierele + scrie messages/ro.json
 *
 * Heuristică detecție RO:
 *   - text JSX între tag-uri care conține cel puțin un caracter diacritic RO (ăâîșț)
 *     SAU este o frază cu cuvinte recognoscibile RO (de min. 2 cuvinte, fără englezisme pure)
 *   - placeholder="...", aria-label="...", title="...", alt="..." cu diacritice RO
 *
 * Generare chei:
 *   - prefix din numele componentei (lowercase, primele 2 cuvinte) → namespace
 *   - cheia = slug din primele 3-4 cuvinte ale textului
 *
 * Usage:
 *   node scripts/extract-i18n-strings.mjs --files=app/[locale]/terms/page.tsx,app/[locale]/privacy/page.tsx
 *   node scripts/extract-i18n-strings.mjs --files=... --apply
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, basename, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MESSAGES_PATH = join(ROOT, "messages/ro.json");

const args = process.argv.slice(2);
const filesArg = args.find((a) => a.startsWith("--files="))?.split("=")[1];
const apply = args.includes("--apply");
const namespaceOverride = args.find((a) => a.startsWith("--namespace="))?.split("=")[1];

if (!filesArg) {
  console.error("Usage: --files=path1.tsx,path2.tsx [--apply] [--namespace=NAME]");
  process.exit(1);
}

const files = filesArg.split(",").map((f) => f.trim()).filter(Boolean);

// ---- helpers ----
const RO_DIACRITIC = /[ăâîșțĂÂÎȘȚ]/;
const COMMON_RO_WORDS = /\b(și|sau|este|sunt|cu|de|pe|la|în|nu|da|pentru|tău|tăi|tale|tatuat|spre|aici|acolo|cont|cont(?:ul)?|comand[ăa]|produs|pre[țt]|liv(?:ra|rar)|adres[ăa]|email|parol[ăa]|user|setări|preferin[țt]e|salv[ae]|continu[ăa]|merg[ie]|click|adaug[ăa]|șterge|edite|verific|trimit|primit|așteptăm|încarcă)\b/i;

function isLikelyRomanian(text) {
  const t = text.trim();
  if (!t || t.length < 2) return false;
  // Skip URLs, emails, code identifiers, paths
  if (/^https?:\/\//.test(t) || /^\w+@\w+/.test(t) || /^[A-Z_][A-Z0-9_]*$/.test(t)) return false;
  // Skip single tokens that look like JS/CSS (no spaces, camelCase / kebab)
  if (!/\s/.test(t) && !RO_DIACRITIC.test(t)) return false;
  // Skip pure numbers, currencies, percentages
  if (/^[\d\s.,%€$ leiRON-]+$/.test(t)) return false;
  // Skip single emoji or short symbols
  if (t.length < 3 && !RO_DIACRITIC.test(t)) return false;
  // Skip text where 80%+ is in {} expressions (template-like)
  // Definite RO: has diacritic OR has common RO word
  return RO_DIACRITIC.test(t) || COMMON_RO_WORDS.test(t);
}

function slugify(text, maxWords = 4) {
  const cleaned = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join(" ")
    .replace(/\s+/g, "_");
  // camelCase from snake
  const parts = cleaned.split("_").filter(Boolean);
  if (parts.length === 0) return "key";
  return parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
}

function deriveNamespace(filePath) {
  if (namespaceOverride) return namespaceOverride;
  // app/[locale]/terms/page.tsx                                  -> terms
  // app/[locale]/account/security/SecurityPageClient.tsx         -> accountSecurity
  // app/[locale]/product/[id]/ProductClient.tsx                  -> product
  // app/[locale]/account/AccountPageClient.tsx                   -> account
  // components/ProductDrawer.tsx                                 -> productDrawer
  // components/onboarding/OnboardingModal.tsx                    -> onboardingModal
  // components/auth/EmailVerifyBanner.tsx                        -> emailVerifyBanner
  const noExt = filePath.replace(/\.(tsx|ts)$/, "");
  const segments = noExt.split(/[\\/]/);
  // Drop generic boilerplate path tokens + parametric segments [foo]
  const cleaned = segments.filter(
    (s) =>
      ![
        "app",
        "[locale]",
        "components",
        "page",
        "layout",
        "loading",
        "error",
        "default",
      ].includes(s) && !/^\[.*\]$/.test(s),
  );
  if (cleaned.length === 0) return "page";
  // Take last segment; strip suffixes
  const last = cleaned[cleaned.length - 1];
  const stripped = last.replace(/(?:Client|Page|Component|View)+$/g, "");
  const ns = stripped.charAt(0).toLowerCase() + stripped.slice(1);
  // If still empty (e.g. file was just "PageClient.tsx"), fall back to parent dir
  if (!ns && cleaned.length > 1) {
    return cleaned[cleaned.length - 2].charAt(0).toLowerCase() + cleaned[cleaned.length - 2].slice(1);
  }
  // If parent dir adds context (account/security/SecurityPageClient -> security clean of suffix),
  // prefix with parent when child differs significantly. Keep simple: parent + cap(child) only if
  // child is short or generic.
  if (cleaned.length > 1) {
    const parent = cleaned[cleaned.length - 2];
    // Skip parent if name already starts with parent (e.g. AccountPage in /account/)
    if (
      ns.toLowerCase().startsWith(parent.toLowerCase()) ||
      parent === ns ||
      ["components", "ui", "feed", "auth", "i18n", "reels", "notifications", "push", "stripe", "reviews", "live", "onboarding", "search", "checkout", "pwa", "seller", "admin"].includes(parent)
    ) {
      return ns.replace(/[^a-zA-Z0-9]/g, "");
    }
    return (parent.charAt(0).toLowerCase() + parent.slice(1) + stripped.charAt(0).toUpperCase() + stripped.slice(1)).replace(/[^a-zA-Z0-9]/g, "");
  }
  return ns.replace(/[^a-zA-Z0-9]/g, "") || "page";
}

// ---- AST visitor ----
function extractFromFile(filePath) {
  const absPath = join(ROOT, filePath);
  const source = readFileSync(absPath, "utf-8");
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ns = deriveNamespace(filePath);

  // Collected: array of { range, text, kind, key }
  const found = [];
  const keysUsed = new Set();

  function makeKey(text) {
    let base = slugify(text);
    let key = base;
    let i = 2;
    while (keysUsed.has(`${ns}.${key}`)) {
      key = `${base}${i}`;
      i++;
    }
    keysUsed.add(`${ns}.${key}`);
    return key;
  }

  function visit(node) {
    // JsxText: text between tags
    if (ts.isJsxText(node)) {
      const raw = node.text;
      const trimmed = raw.trim();
      if (isLikelyRomanian(trimmed)) {
        const key = makeKey(trimmed);
        found.push({
          start: node.getStart(sf),
          end: node.getEnd(),
          text: trimmed,
          rawLen: raw.length,
          leadingWs: raw.match(/^\s*/)[0],
          trailingWs: raw.match(/\s*$/)[0],
          kind: "jsxText",
          key,
        });
      }
    }
    // String literal as JSX attribute value: placeholder="...", aria-label="..."
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const attrName = node.name.getText(sf);
      const targetAttrs = ["placeholder", "aria-label", "ariaLabel", "title", "alt"];
      if (targetAttrs.includes(attrName)) {
        const text = node.initializer.text;
        if (isLikelyRomanian(text)) {
          const key = makeKey(text);
          found.push({
            start: node.initializer.getStart(sf),
            end: node.initializer.getEnd(),
            text,
            kind: "attrString",
            attrName,
            key,
          });
        }
      }
    }
    // JsxExpression containing a string literal inside braces: {"text RO"}
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      ts.isStringLiteral(node.expression)
    ) {
      const text = node.expression.text;
      if (isLikelyRomanian(text)) {
        const key = makeKey(text);
        found.push({
          start: node.getStart(sf),
          end: node.getEnd(),
          text,
          kind: "jsxStringExpr",
          key,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  return { ns, source, found, sourceFile: sf, absPath };
}

function rewriteFile({ ns, source, found, absPath }) {
  if (found.length === 0) return source;

  // Sort by start descending to apply edits without shifting indices
  const sorted = [...found].sort((a, b) => b.start - a.start);
  let out = source;
  for (const f of sorted) {
    let replacement;
    if (f.kind === "jsxText") {
      replacement = `${f.leadingWs}{t("${f.key}")}${f.trailingWs}`;
    } else if (f.kind === "attrString") {
      // Keep attr name, replace value with {t(...)}
      replacement = `{t("${f.key}")}`;
    } else if (f.kind === "jsxStringExpr") {
      replacement = `{t("${f.key}")}`;
    }
    out = out.slice(0, f.start) + replacement + out.slice(f.end);
  }

  // Detect server-vs-client: server (no "use client" + async export default) needs getTranslations from next-intl/server
  const isClient = /^["']use client["'];?/m.test(out.slice(0, 200));
  const exportedAsync = /export\s+default\s+async\s+function/.test(out);
  const useServerApi = !isClient && exportedAsync;
  const importLine = useServerApi
    ? `import { getTranslations } from "next-intl/server";`
    : `import { useTranslations } from "next-intl";`;
  const callExpr = useServerApi
    ? `const t = await getTranslations("${ns}");`
    : `const t = useTranslations("${ns}");`;

  // Ensure import is present (don't duplicate)
  const hasImport = useServerApi
    ? /from\s+["']next-intl\/server["']/.test(out) && /getTranslations/.test(out)
    : /from\s+["']next-intl["']/.test(out) && /useTranslations/.test(out);
  if (!hasImport) {
    const importMatch = [...out.matchAll(/^import\s+.+?;$/gm)];
    if (importMatch.length > 0) {
      const lastImp = importMatch[importMatch.length - 1];
      const insertPos = lastImp.index + lastImp[0].length;
      out = out.slice(0, insertPos) + `\n${importLine}` + out.slice(insertPos);
    } else {
      out = `${importLine}\n${out}`;
    }
  }

  // Inject `const t = ...;` inside the default exported function body
  const callRegex = new RegExp(
    `(?:useTranslations|getTranslations)\\(["']${ns}["']\\)`,
  );
  if (!callRegex.test(out)) {
    const fnMatch = out.match(/export\s+default\s+(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*(?::[^{]+)?\{/);
    if (fnMatch) {
      const insertPos = fnMatch.index + fnMatch[0].length;
      out = out.slice(0, insertPos) + `\n  ${callExpr}` + out.slice(insertPos);
    } else {
      const arrowMatch = out.match(/const\s+\w+\s*[:=]\s*\([^)]*\)\s*(?::[^=]+)?=>\s*\{/);
      if (arrowMatch) {
        const insertPos = arrowMatch.index + arrowMatch[0].length;
        out = out.slice(0, insertPos) + `\n  ${callExpr}` + out.slice(insertPos);
      } else {
        console.warn(`  [WARN] Could not inject translations call in ${absPath} — please add manually`);
      }
    }
  }

  return out;
}

function loadMessages() {
  try {
    return JSON.parse(readFileSync(MESSAGES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveMessages(obj) {
  writeFileSync(MESSAGES_PATH, JSON.stringify(obj, null, 2) + "\n");
}

// ---- main ----
let totalFound = 0;
const extractedByNs = {};

for (const file of files) {
  console.log(`\n=== ${file} ===`);
  let result;
  try {
    result = extractFromFile(file);
  } catch (e) {
    console.error(`  [ERROR] ${e.message}`);
    continue;
  }
  console.log(`  namespace: ${result.ns}, found: ${result.found.length}`);
  if (result.found.length === 0) continue;
  for (const f of result.found.slice(0, 10)) {
    console.log(`    [${f.kind}] ${result.ns}.${f.key} = ${JSON.stringify(f.text.slice(0, 80))}`);
  }
  if (result.found.length > 10) console.log(`    ... and ${result.found.length - 10} more`);

  extractedByNs[result.ns] = extractedByNs[result.ns] || {};
  for (const f of result.found) {
    extractedByNs[result.ns][f.key] = f.text;
  }
  totalFound += result.found.length;

  if (apply) {
    const newSource = rewriteFile(result);
    writeFileSync(result.absPath, newSource);
    console.log(`  [applied] rewrote ${file}`);
  }
}

if (apply && totalFound > 0) {
  const messages = loadMessages();
  for (const [ns, keys] of Object.entries(extractedByNs)) {
    messages[ns] = { ...(messages[ns] || {}), ...keys };
  }
  saveMessages(messages);
  console.log(`\n[applied] wrote ${totalFound} keys across ${Object.keys(extractedByNs).length} namespaces to ${MESSAGES_PATH}`);
} else {
  console.log(`\nTotal would-extract: ${totalFound} strings across ${Object.keys(extractedByNs).length} namespaces`);
  console.log("(dry-run; use --apply to write)");
}
