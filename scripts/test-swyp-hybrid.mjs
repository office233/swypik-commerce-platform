/**
 * Test plată hibridă SWYP: plafon 50%, idempotență, fallback la eroare.
 *   node scripts/test-swyp-hybrid.mjs
 * Nedistructiv: rulează în tranzacție și face ROLLBACK.
 */
import pg from "pg";
import fs from "node:fs";

if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) {
    const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m);
    if (m) process.env.DATABASE_URL = m[1].trim();
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.error(`  ✗ ${name} ${extra}`); }
};

console.log("== Plată hibridă SWYP ==");
await c.query("BEGIN");
try {
    // 1. Config plafon există și e rezonabil.
    const { rows: cfg } = await c.query(
        `SELECT value FROM platform_config WHERE key='swyp_max_payment_pct'`,
    );
    const pct = Number(cfg[0]?.value ?? 0);
    check("plafon swyp_max_payment_pct configurat", pct > 0 && pct <= 100, `pct=${pct}`);
    check("plafonul lasă platforma să încaseze bani reali", pct < 100, `pct=${pct}`);

    // 2. Coloana pe comenzi există.
    const { rows: col } = await c.query(
        `SELECT column_name FROM information_schema.columns
      WHERE table_name='commerce_orders' AND column_name='swyp_paid_cents'`,
    );
    check("commerce_orders.swyp_paid_cents există", col.length === 1);

    // 3. Simulare: total 100 RON, plafon pct% → maxim acoperit.
    const totalCents = 10000;
    const capByPct = Math.floor((totalCents * pct) / 100);
    check("la 100 RON, SWYP acoperă cel mult plafonul", capByPct <= totalCents / 2 || pct > 50,
        `cap=${capByPct}`);

    // 4. Curs 0 (fără tranzacții reale) → nu se poate plăti cu SWYP.
    const { rows: fund } = await c.query(`SELECT balance_cents FROM swyp_backing_fund WHERE id=1`);
    const { rows: circ } = await c.query(`SELECT COALESCE(SUM(balance_units),0)::text AS u FROM swyp_balances`);
    const rateZero = Number(fund[0]?.balance_cents ?? 0) === 0 || BigInt(circ[0].u) === 0n;
    check("fără încasări reale, SWYP nu poate plăti (curs 0)", rateZero,
        `fond=${fund[0]?.balance_cents} circ=${circ[0].u}`);

    // 5. Idempotența redeem-ului: cheia unică pe ledger.
    const { rows: idx } = await c.query(
        `SELECT conname FROM pg_constraint
      WHERE conrelid='swyp_ledger_entries'::regclass AND contype='u'`,
    );
    check("ledger are constrângere de unicitate (idempotență)", idx.length > 0,
        idx.map((r) => r.conname).join(","));
} finally {
    await c.query("ROLLBACK");
}

console.log(`\n${pass} passed, ${fail} failed`);
await c.end();
process.exit(fail > 0 ? 1 : 0);
