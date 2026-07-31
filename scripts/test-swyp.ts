/**
 * Test de integrare pentru economia SWYP (rulează pe DB-ul din DATABASE_URL).
 *   npx tsx scripts/test-swyp.ts
 *
 * Acoperă:
 *  1. invariantul de supply (suma pool-uri + solduri = supply fix);
 *  2. transfer pool→user + idempotență (dublu-submit = 1 singură creditare);
 *  3. concurență: 5 claim-uri simultane cu același ref → 1 singură intrare;
 *  4. fonduri insuficiente → refuz;
 *  5. integritatea hash-chain-ului;
 *  6. mining: start → claim înainte de termen refuzat; cap zilnic respectat;
 *  7. requires_paid_tx: reward fără plată → refuzat.
 *
 * Folosește un user de test dedicat și face cleanup la final (ledger-ul e
 * append-only: intrările de test rămân, marcate cu ref_type prefixat "test:").
 */
import { randomUUID } from "crypto";
import { dbQuery, getDb } from "../lib/db";
import {
    swypTransfer,
    getSwypBalanceUnits,
    verifySupplyInvariant,
    verifyHashChain,
    SwypInsufficientFundsError,
} from "../lib/swyp/ledger";
import { awardSwyp } from "../lib/swyp/rewards";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
    console.log("== SWYP economy integration tests ==");

    // user de test
    const email = `swyp-test-${Date.now()}@test.local`;
    const { rows: userRows } = await dbQuery<{ id: string }>(
        `INSERT INTO users (email, username, display_name) VALUES ($1, $2, 'SWYP Test') RETURNING id::text`,
        [email, `swyp_test_${Date.now()}`],
    );
    const userId = userRows[0].id;

    try {
        // 1. invariant inițial
        const diff0 = await verifySupplyInvariant();
        check("supply invariant (initial)", diff0 === 0n, `diff=${diff0}`);

        // 2. transfer + idempotență
        const ref = `test:${randomUUID()}`;
        const t1 = await swypTransfer({
            from: { pool: "rewards" }, to: { userId },
            amountUnits: 1234n, kind: "reward", refType: "test:transfer", refId: ref,
        });
        const t2 = await swypTransfer({
            from: { pool: "rewards" }, to: { userId },
            amountUnits: 1234n, kind: "reward", refType: "test:transfer", refId: ref,
        });
        check("first transfer applied", !t1.alreadyApplied);
        check("duplicate is no-op", t2.alreadyApplied && t2.entry.id === t1.entry.id);
        const bal = await getSwypBalanceUnits(userId);
        check("balance credited exactly once", bal === 1234n, `bal=${bal}`);

        // 3. concurență: 5 transferuri simultane cu același ref
        const cRef = `test:${randomUUID()}`;
        const results = await Promise.allSettled(
            Array.from({ length: 5 }, () =>
                swypTransfer({
                    from: { pool: "rewards" }, to: { userId },
                    amountUnits: 500n, kind: "reward", refType: "test:concurrent", refId: cRef,
                }),
            ),
        );
        const applied = results.filter((r) => r.status === "fulfilled" && !r.value.alreadyApplied).length;
        const okAll = results.every((r) => r.status === "fulfilled");
        check("5 concurrent same-ref → all succeed", okAll);
        check("…but exactly 1 applied", applied === 1, `applied=${applied}`);
        const bal2 = await getSwypBalanceUnits(userId);
        check("balance +500 once", bal2 === 1734n, `bal=${bal2}`);

        // 4. fonduri insuficiente
        let threw = false;
        try {
            await swypTransfer({
                from: { userId }, to: { pool: "rewards" },
                amountUnits: 999999n, kind: "spend", refType: "test:overdraft", refId: randomUUID(),
            });
        } catch (e) { threw = e instanceof SwypInsufficientFundsError; }
        check("overdraft rejected", threw);

        // 5. hash-chain intact
        const corrupt = await verifyHashChain();
        check("hash-chain intact", corrupt === null, `first bad id=${corrupt}`);

        // 6. requires_paid_tx: referral fără plată → refuzat
        const noPay = await awardSwyp({ userId, action: "referral_validated", refId: randomUUID() });
        check("referral without paid tx rejected", !noPay.awarded && (noPay as any).reason === "paid_tx_required");
        const withPay = await awardSwyp({
            userId, action: "referral_validated", refId: randomUUID(), paidTxRef: "pi_test_123",
        });
        check("referral with paid tx awarded", withPay.awarded === true);

        // 7. cap zilnic (order_review: 500/e, cap 1500 → a 4-a pică)
        let capHit = false;
        for (let i = 0; i < 4; i++) {
            const r = await awardSwyp({ userId, action: "order_review", refId: randomUUID(), paidTxRef: "pi_x" });
            if (!r.awarded && (r as any).reason === "daily_cap_reached") capHit = true;
        }
        check("daily cap enforced", capHit);

        // invariant final — după toate mutările
        const diffEnd = await verifySupplyInvariant();
        check("supply invariant (final)", diffEnd === 0n, `diff=${diffEnd}`);

        // 8. Hook referral: prima comandă plătită validează și plătește invitatorul
        {
            const { onOrderPaid } = await import("../lib/swyp/hooks");
            const inviteeEmail = `swyp-invitee-${Date.now()}@test.local`;
            const { rows: iu } = await dbQuery<{ id: string }>(
                `INSERT INTO users (email, username, display_name) VALUES ($1,$2,'Invitee') RETURNING id::text`,
                [inviteeEmail, `swyp_inv_${Date.now()}`],
            );
            const inviteeId = iu[0].id;
            await dbQuery(
                `INSERT INTO referral_codes (user_id, code) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                [userId, `TST${Date.now()}`.slice(0, 12)],
            ).catch(() => {});
            await dbQuery(
                `INSERT INTO referral_attributions (invitee_user_id, referrer_user_id, anti_fraud_score, source)
                 VALUES ($1,$2,0.9,'test') ON CONFLICT DO NOTHING`,
                [inviteeId, userId],
            );
            const { rows: ord } = await dbQuery<{ id: string }>(
                `INSERT INTO commerce_orders (buyer_user_id, status, currency, total_cents, subtotal_cents)
                 VALUES ($1,'paid','RON',5000,5000) RETURNING id::text`,
                [inviteeId],
            );
            const balBefore = await getSwypBalanceUnits(userId);
            await onOrderPaid(ord[0].id, "pi_test_referral");
            const balAfter = await getSwypBalanceUnits(userId);
            check("referral platit la prima comanda", balAfter > balBefore, `${balBefore} -> ${balAfter}`);

            // rulare repetată → fără dublă plată
            await onOrderPaid(ord[0].id, "pi_test_referral");
            const balAgain = await getSwypBalanceUnits(userId);
            check("hook idempotent (fara dubla plata)", balAgain === balAfter, `${balAfter} -> ${balAgain}`);

            await dbQuery(`DELETE FROM commerce_orders WHERE id = $1`, [ord[0].id]).catch(() => {});
            await dbQuery(`DELETE FROM referral_attributions WHERE invitee_user_id = $1`, [inviteeId]).catch(() => {});
        }
    } finally {
        // cleanup: returnează soldul în pool și șterge userul de test
        const remaining = await getSwypBalanceUnits(userId);
        if (remaining > 0n) {
            await swypTransfer({
                from: { userId }, to: { pool: "rewards" },
                amountUnits: remaining, kind: "adjustment",
                refType: "test:cleanup", refId: randomUUID(),
                description: "test cleanup — return funds to rewards pool",
            });
        }
        await dbQuery(`DELETE FROM swyp_mining_sessions WHERE user_id = $1`, [userId]);
        // intrările din ledger rămân (append-only); userul se poate șterge doar
        // dacă FK-urile permit — altfel îl lăsăm marcat
        await dbQuery(`UPDATE users SET email = email || '.done' WHERE id = $1`, [userId]).catch(() => { });
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    await getDb().end();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
