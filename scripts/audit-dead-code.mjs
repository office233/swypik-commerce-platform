// Audit cod mort: fișiere .ts/.tsx din components/ și lib/ pe care nu le importă nimeni.
import fs from "node:fs";
import path from "node:path";

const files = [];
const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (/node_modules|\.next/.test(p)) continue;
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p.replaceAll("\\", "/"));
    }
};
["app", "components", "lib", "types", "hooks"].filter((d) => fs.existsSync(d)).forEach(walk);

const allSrc = files.map((f) => ({ f, src: fs.readFileSync(f, "utf8") }));
const joined = allSrc.map((x) => x.src).join("\n");

// candidați: components/ și lib/ (app/ e routing — folosit de framework)
const candidates = files.filter((f) => /^(components|lib|hooks|types)\//.test(f));
const dead = [];
for (const f of candidates) {
    const noExt = f.replace(/\.(ts|tsx)$/, "");
    const base = path.basename(noExt);
    const aliases = [
        `@/${noExt}`,
        `@/${noExt.replace(/\/index$/, "")}`,
        `./${base}`,
        `../${base}`,
    ];
    const used = aliases.some((a) => joined.includes(`"${a}"`) || joined.includes(`'${a}'`)) ||
        // dynamic import cu template
        joined.includes(`(\`@/${noExt}\`)`) ||
        // re-export prin folder
        new RegExp(`from ["'][^"']*/${base}["']`).test(joined);
    if (!used) dead.push(f);
}
console.log(`Candidați cod mort (${dead.length}):`);
console.log(dead.join("\n"));
