-- Raport economic SWYP: supply, trezorerie, rate de emisie, sustenabilitate.
\echo '=== TREZORERIE (SWYP) ==='
SELECT pool,
       (balance_units/100)::bigint AS swyp_disponibil,
       round(100.0 * balance_units / (SELECT SUM(balance_units) FROM swyp_treasury_pools), 1) AS pct
FROM swyp_treasury_pools ORDER BY balance_units DESC;

\echo '=== REGULI DE EMISIE (per actiune) ==='
SELECT action,
       (amount_units/100.0) AS swyp_per_actiune,
       (daily_cap_units/100.0) AS cap_zilnic_swyp,
       (daily_cap_units / NULLIF(amount_units,0)) AS max_actiuni_pe_zi,
       requires_paid_tx AS necesita_plata,
       enabled
FROM swyp_emission_rules ORDER BY amount_units DESC;

\echo '=== COST MAXIM TEORETIC / USER / ZI (daca face TOT la cap) ==='
SELECT (SUM(COALESCE(daily_cap_units, amount_units))/100.0) AS swyp_max_per_user_zi
FROM swyp_emission_rules WHERE enabled;

\echo '=== DURATA POOL REWARDS la 1k / 10k / 100k useri activi zilnic ==='
WITH cap AS (
  SELECT SUM(COALESCE(daily_cap_units, amount_units)) AS max_zi FROM swyp_emission_rules WHERE enabled
), pool AS (
  SELECT balance_units FROM swyp_treasury_pools WHERE pool = 'rewards'
)
SELECT u.users AS useri_activi_zi,
       round((pool.balance_units / (cap.max_zi * u.users))::numeric, 0) AS zile_max_teoretic,
       round((pool.balance_units / (cap.max_zi * u.users) / 365)::numeric, 1) AS ani_max_teoretic,
       -- realist: userul mediu face ~15% din capul maxim
       round((pool.balance_units / (cap.max_zi * 0.15 * u.users) / 365)::numeric, 1) AS ani_realist_15pct
FROM pool, cap, (VALUES (1000),(10000),(100000),(1000000)) AS u(users);

\echo '=== DOAR MINING ZILNIC: cati ani tine pool-ul rewards ==='
WITH m AS (SELECT amount_units FROM swyp_emission_rules WHERE action='mining_daily'),
     p AS (SELECT balance_units FROM swyp_treasury_pools WHERE pool='rewards')
SELECT u.users AS mineri_zilnici,
       round((p.balance_units / (m.amount_units * u.users) / 365)::numeric, 1) AS ani_fara_halving
FROM p, m, (VALUES (1000),(10000),(100000),(1000000),(10000000)) AS u(users);

\echo '=== STARE ACTUALA ==='
SELECT (SELECT COUNT(*) FROM users) AS useri_total,
       (SELECT COUNT(*) FROM swyp_balances WHERE balance_units > 0) AS detinatori,
       (SELECT COALESCE(SUM(balance_units),0)/100 FROM swyp_balances) AS swyp_in_circulatie,
       (SELECT COUNT(*) FROM swyp_ledger_entries) AS tranzactii_ledger,
       swyp_verify_supply() AS invariant_diff;
