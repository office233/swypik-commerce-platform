import fs from "node:fs";
import path from "node:path";
const out = {};
function walk(d) {
    for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        const st = fs.statSync(p);
        if (st.isDirectory()) {
            if (!/node_modules|\.next|\.git/.test(p)) walk(p);
        } else if (/\.tsx$/.test(f)) {
            const s = fs.readFileSync(p, "utf8");
            const hits = [];
            s.split(/\r?\n/).forEach((l, i) => {
                if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
                const m =
                    l.match(/>[^<>{}]*[ăâîșțĂÂÎȘȚ][^<>{}]*</) ||
                        l.match(/(?:placeholder|title|label|aria-label)="[^"]*[ăâîșțĂÂÎȘȚ][^"]*"/) ||
                        // literale JS cu diacritice românești (obiecte, array-uri, toast(), alert() etc.)
                        l.match(/["'`][^"'`\n]*[ăâîșțĂÂÎȘȚ][^"'`\n]*["'`]/);
                if (m) hits.push(i + 1);
            });
            if (hits.length) out[p.replace(/\\/g, "/")] = hits;
        }
    }
}
walk("app");
walk("components");
const e = Object.entries(out).sort((a, b) => b[1].length - a[1].length);
console.log("files:", e.length, "hits:", e.reduce((s, x) => s + x[1].length, 0));
for (const [f, hits] of e) console.log(hits.length, f, hits.slice(0, 15).join(","));
