// Audit referinte: cauta stringuri in app/, components/, lib/ (fara node_modules/.next)
import { execSync } from "node:child_process";

const patterns = [
  'href="/collections', "push(\"/collections", "href={`/collections",
  'href="/best', 'href="/categories', 'href="/hashtag', "href={`/hashtag",
  'href="/r/', "href={`/r/", 'href="/audio', "href={`/audio",
  "FEATURE_", "featureFlags.",
];
for (const p of patterns) {
  let out = "";
  try {
    out = execSync(`git grep -l -F "${p}" -- app components lib`, { encoding: "utf8" }).trim();
  } catch { /* no matches */ }
  console.log(`== ${p}: ${out ? "\n  " + out.split("\n").join("\n  ") : "CURAT"}`);
}
