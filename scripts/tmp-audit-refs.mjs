// Audit referinte: cauta stringuri in app/, components/, lib/ (fara node_modules/.next)
import { execSync } from "node:child_process";

const patterns = [
  "visual-search", "api/voice", "eats/quote", "trips/packages",
  "aliexpress", "AudioPicker", "audio/[id]", '"/audio', "'/audio",
  '"/r/', "collections", "hashtag", "/best", "categories",
];
for (const p of patterns) {
  let out = "";
  try {
    out = execSync(`git grep -l -F "${p}" -- app components lib`, { encoding: "utf8" }).trim();
  } catch { /* no matches */ }
  console.log(`== ${p}: ${out ? "\n  " + out.split("\n").join("\n  ") : "CURAT"}`);
}
