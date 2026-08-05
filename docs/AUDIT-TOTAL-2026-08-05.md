# AUDIT TOTAL — 2026-08-05

> Auditor: Claude Code. Metodă: modul cu modul (audit → fix → verificare → commit).
> Baseline la start: `npx tsc --noEmit` = 0 erori · `.i18n-baseline.json` = 460 hits · working tree curat.

## REZUMAT EXECUTIV

_(se completează la final)_

## DECIZII NECESARE (pentru om)

_(se completează pe parcurs)_

## Tabel module

| # | Modul | Găsit | Reparat | Commit(s) | Rămas |
|---|-------|-------|---------|-----------|-------|
| 1 | Auth + middleware | în curs | | | |
| 2 | Bani | — | | | |
| 3 | Shop | — | | | |
| 4 | SWYP economy | — | | | |
| 5 | Social/video | — | | | |
| 6 | Go/rides | — | | | |
| 7 | Fly/Stays/Food | — | | | |
| 8 | Live/creator | — | | | |
| 9 | Seller/admin | — | | | |
| 10 | Cron/internal/webhooks | — | | | |
| 11 | i18n + SEO | — | | | |
| 12 | Infra | — | | | |

## Probleme cunoscute din audituri anterioare (NU re-descoperi)

- REZOLVATE deja: FX live, comisioane în `lib/config/commerce.ts`, preț fals 29 RON, rating fals 4.5, CSP report-only, not-found boundary `[locale]`, like/save nelogat.
- DESCHISE (moștenite, de tratat în modulele respective):
  - P1 FX cron eșec silențios (`app/api/cron/refresh-fx/route.ts` — updated=0 raportat ca OK) + fallback `EUR: 4.97` hardcodat în `lib/fly/fx.ts` → Modul 2/10.
  - P1 `STRIPE_SECRET_KEY` placeholder în prod → DECIZIE OM.
  - P2 rating fals 4.9 din metadata la produsele Fly (`ratingCount:0`) → Modul 3.
  - P2 15 videouri stuck `uploading` >24h, fără TTL cleanup → Modul 5.
  - P3 `cancel_reason` NULL la anulare dispatch → Modul 6.
  - P3 date murdare `couriers.city` + lipsă pagină publică aplicare curier → Modul 6.
  - P3 rânduri `failed` acumulate în `commerce_orders` la checkout eșuat → Modul 2.

---

## Modul 1 — Auth (`lib/auth`, `app/api/auth`, `middleware.ts`)

_(în curs)_
