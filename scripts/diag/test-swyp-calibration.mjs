/**
 * Verifică echilibrul economic SWYP pe valorile REALE din DB (zero hardcodări
 * în test: procentele se citesc din platform_config și swyp_emission_rules).
 *
 *   node scripts/test-swyp-calibration.mjs
 *
 * Regula de sănătate: pentru fiecare tranzacție, valoarea intrată în fond
 * trebuie să fie >= valoarea emisă ca SWYP. Altfel cursul scade constant.
 */
import pg from "pg";
import fs from "node:fs";

if (!process.env.DATABASE_URL && fs.existsSync(".env.local")) {
    const m = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m);
    if (m) process.env.DATABASE_URL = m[1].trim();
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const cfg = await c.query(`SELECT value FROM platform_config WHERE key='swyp_backing_pct'`);
const backingPct = Number(cfg.rows[0]?.value ?? 10);
const rules = await c.query(
    `SELECT action, amount_units, pct_of_value_bps FROM swyp_emission_rules
    WHERE action IN ('go_ride_completed','eats_delivery_on_time')`,
);

// Comisionul efectiv al platformei (trepte Founding Drivers), din DB.
const zone = await c.query(
    `SELECT platform_commission_pct, booking_fee_cents FROM pricing_zones
    WHERE kind='ride' AND active LIMIT 1`,
);
const commissionPct = Number(zone.rows[0]?.platform_commission_pct ?? 20);
const bookingFee = Number(zone.rows[0]?.booking_fee_cents ?? 0);

console.log("\n=== Calibrare SWYP (valori din DB) ===\n");
console.log(`  backing_pct        : ${backingPct}% din comision`);
console.log(`  comision zonă      : ${commissionPct}%`);
console.log(`  booking fee        : ${(bookingFee / 100).toFixed(2)} RON\n`);

let pass = 0;
let fail = 0;
const check = (n, ok, extra = "") => {
    ok ? pass++ : fail++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${n} ${extra}`);
};

// Scenarii de tarif: cursă minimă, medie, mare (cents, inclusiv booking fee).
for (const fare of [1200, 3090, 8000]) {
    const rule = rules.rows.find((r) => r.action === "go_ride_completed");
    const bps = rule?.pct_of_value_bps ? Number(rule.pct_of_value_bps) : null;

    const netFare = fare - bookingFee;
    const commission = Math.round((netFare * commissionPct) / 100) + bookingFee;
    const toFund = Math.floor((commission * backingPct) / 100);
    const emitted = bps ? Math.floor((fare * bps) / 10_000) : null;

    console.log(`\n  --- cursă ${(fare / 100).toFixed(2)} RON ---`);
    console.log(`      comision platformă : ${(commission / 100).toFixed(2)} RON`);
    console.log(`      intră în fond      : ${(toFund / 100).toFixed(2)} RON (${((toFund / fare) * 100).toFixed(2)}% din tarif)`);
    if (emitted !== null) {
        console.log(`      emis ca SWYP       : ${(emitted / 100).toFixed(2)} RON echivalent (${(bps / 100).toFixed(2)}%)`);
        check(
            `acoperire >= emisie la ${(fare / 100).toFixed(0)} RON`,
            toFund >= emitted,
            `(${toFund} vs ${emitted} cents)`,
        );
    } else {
        console.log("      emisie fixă (fără pct_of_value_bps)");
    }
}

// Emisia trebuie să fie proporțională pentru toate acțiunile de tranzacție.
for (const r of rules.rows) {
    check(`${r.action} are emisie proporțională`, r.pct_of_value_bps !== null);
}

console.log(`\n=== ${pass} PASS, ${fail} FAIL ===\n`);
await c.end();
process.exit(fail === 0 ? 0 : 1);
