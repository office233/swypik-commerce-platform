/**
 * Test model economic SWYP: valoarea vine DOAR din încasări reale.
 *   node scripts/test-swyp-valuation.mjs
 * Necesită DATABASE_URL (se ia din .env.local dacă lipsește).
 */
import pg from "pg";
import fs from "node:fs";

if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) {
    const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m);
    if (m) process.env.DATABASE_URL = m[1].trim();
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
    if (cond) {
        pass++;
        console.log(`  PASS  ${name}`);
    } else {
        fail++;
        console.log(`  FAIL  ${name} ${extra}`);
    }
};

const MICRO = 1_000_000n;
const rateOf = async () => {
    const f = await c.query("SELECT balance_cents FROM swyp_backing_fund WHERE id=1");
    const s = await c.query("SELECT COALESCE(SUM(balance_units),0)::text AS t FROM swyp_balances");
    const backing = BigInt(f.rows[0].balance_cents);
    const circ = BigInt(s.rows[0].t);
    return {
        backing,
        circ,
        rate: circ > 0n && backing > 0n ? (backing * MICRO) / circ : 0n,
    };
};

console.log("\n=== SWYP valuation ===\n");

// Snapshot ca să restaurăm la final.
const snap = (await c.query("SELECT * FROM swyp_backing_fund WHERE id=1")).rows[0];

try {
    // 1. Fără acoperire → curs 0.
    await c.query("BEGIN");
    await c.query("UPDATE swyp_backing_fund SET balance_cents=0 WHERE id=1");
    let r = await rateOf();
    check("fond 0 → curs 0 (SWYP nu poate plăti nimic)", r.rate === 0n, `rate=${r.rate}`);

    // 2. Prima încasare reală → cursul devine > 0 (dacă există SWYP în circulație).
    await c.query("UPDATE swyp_backing_fund SET balance_cents=10000 WHERE id=1"); // 100 RON
    r = await rateOf();
    if (r.circ > 0n) {
        check("după încasare reală → curs > 0", r.rate > 0n, `rate=${r.rate}`);
        const ronPerSwyp = Number((r.rate * 100n) / 100n) / 1_000_000;
        console.log(`        curs: 1 SWYP ≈ ${ronPerSwyp.toFixed(4)} RON (fond 100 RON, ${r.circ / 100n} SWYP)`);
    } else {
        check("fără SWYP în circulație → curs 0 chiar cu fond", r.rate === 0n, `rate=${r.rate}`);
        console.log("        (nu există solduri SWYP la utilizatori pe acest DB)");
    }

    // 3. Mai mult fond, aceeași circulație → curs mai mare.
    const before = r.rate;
    await c.query("UPDATE swyp_backing_fund SET balance_cents=20000 WHERE id=1");
    const r2 = await rateOf();
    check(
        "fond dublu → curs dublu (proporțional)",
        r.circ > 0n ? r2.rate === before * 2n : r2.rate === 0n,
        `${before} → ${r2.rate}`,
    );

    // 4. Idempotența alimentării (UNIQUE pe direction+ref).
    await c.query(
        `INSERT INTO swyp_backing_ledger (direction, amount_cents, ref_type, ref_id)
     VALUES ('in', 500, 'test', 'idem-1') ON CONFLICT DO NOTHING`,
    );
    const dup = await c.query(
        `INSERT INTO swyp_backing_ledger (direction, amount_cents, ref_type, ref_id)
     VALUES ('in', 500, 'test', 'idem-1') ON CONFLICT DO NOTHING RETURNING id`,
    );
    check("alimentare idempotentă (a doua oară = no-op)", dup.rows.length === 0);

    // 5. Fondul nu poate intra pe negativ.
    const neg = await c
        .query("UPDATE swyp_backing_fund SET balance_cents = -1 WHERE id=1")
        .then(() => false)
        .catch(() => true);
    check("fondul nu poate fi negativ (CHECK în DB)", neg);

    await c.query("ROLLBACK");

    // 6. Invariant global: ce a ieșit nu depășește ce a intrat.
    const inv = await c.query(
        `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE direction='in'),0)::text AS i,
            COALESCE(SUM(amount_cents) FILTER (WHERE direction='out'),0)::text AS o
       FROM swyp_backing_ledger`,
    );
    check(
        "invariant: total ieșit ≤ total intrat",
        BigInt(inv.rows[0].o) <= BigInt(inv.rows[0].i),
        `in=${inv.rows[0].i} out=${inv.rows[0].o}`,
    );

    // 7. Fondul reflectă ledgerul.
    const cur = (await c.query("SELECT * FROM swyp_backing_fund WHERE id=1")).rows[0];
    check(
        "fond restaurat după rollback (test nedistructiv)",
        String(cur.balance_cents) === String(snap.balance_cents),
        `${cur.balance_cents} vs ${snap.balance_cents}`,
    );
} catch (err) {
    await c.query("ROLLBACK").catch(() => { });
    console.error("EROARE:", err.message);
    fail++;
}

console.log(`\n=== ${pass} PASS, ${fail} FAIL ===\n`);
await c.end();
process.exit(fail === 0 ? 0 : 1);
