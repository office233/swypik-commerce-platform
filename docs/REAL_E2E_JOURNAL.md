# Jurnal testare reală E2E — Swypik

> Cronologic. Format: personaj/val → pas → așteptat → observat → PASS/FAIL → fix (commit).

## 2026-08-02 — Valul 1: audit ostil (SA-1..SA-6)

| Val | Găsire | Rezultat | Fix (commit) |
|---|---|---|---|
| SA-1/5 | Praguri fraud 50/70, referral 0.5/3, chain params, rate engagement sintetic duplicate — hardcodate | FAIL → FIXED | be3ade0d (lib/risk/thresholds.ts, lib/swyp/chain-public.ts, lib/config/synthetic-engagement.ts) |
| SA-2 | Fluxuri bani (checkout/wallet/refund/payout): preț din DB, FOR UPDATE, idempotency | PASS (F1–F8 triate, niciun exploit real) | docs 3f0b9768 |
| SA-3 | live/page.tsx fără i18n (texte RO hardcodate pentru toți userii) | FAIL → FIXED | fd328ce1 (namespace livePage × 7 limbi) |
| SA-4 | 3 migrări 20260513_0008_* duplicate cu 0009–0011 | FAIL → FIXED | fd328ce1 (șterse) |
| SA-6 (multi-erp) | P0: facturi recurente + dashboard KPI fără filtru tenant | FAIL → FIXED | multi-erp 1e22172 |

## 2026-08-02 — Incident deploy

- **FAIL**: după `up -d --build web-next` doar cu `docker-compose.prod.yml`, site 502 (local 000). Root cause: maparea `3005:3000` e în `docker-compose.vps.yml`, nu în prod.yml — compose a recreat containerul fără port publicat.
- **FIX**: redeploy cu scriptul canonic `scripts/wsl-deploy-web.sh` (prod+vps+minio). Re-test: local=200, https://swypik.com/en=200. Lecție notată în memoria repo.

## 2026-08-02 — Valul 2: teste + crawl

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| `tsc --noEmit` | 0 erori | 0 (după npm install în /opt — node_modules desincronizat) | PASS |
| vitest unit | verzi | 71/71 | PASS |
| `go test ./...` multi-erp | verzi | 28 pachete ok, 0 FAIL | PASS |
| Playwright E2E (mobil+desktop) | verzi | 48/50 → fix search.spec (h1 locale-dependent) → 50/50 | FAIL → FIXED (8bdbb99b) |
| Crawl toate paginile statice (~120 rute) pe :3005 | 200/redirect/401 | 3×404: `/cauze`, `/developers`, `/apps` — lipseau din NON_LOCALIZED_PREFIXES în middleware | FAIL → FIXED (903b0bb9) |

## Urmează

- Personaje P1–P7 cap-coadă în browser (mobil 390×844 + desktop)
- Smoke final P1–P7 pe https://swypik.com

## 2026-08-02 — Redesign Explorează TikTok-style

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| Crawl re-test după fix middleware | /cauze /developers /apps = 200 | 200/200/200, crawl complet 0 FAIL | PASS |
| Redesign: action rail dreapta (avatar+follow, like, comentarii, save, share cu contoare), snap-scroll, CommentsSheet bottom-sheet | UI TikTok-style pe mobil 390×844 | Rail vizibil cu toate 5 acțiunile, contoare 0 (date reale), cockpit produs păstrat cu Alternative+Cart; UI vechi „Merită/Nu merită"+coin-burst ELIMINAT din cod (commit 67d315ec) | PASS |
| Verificare vizuală screenshot mobil | fără suprapuneri, gradient ok | OK (screenshot în sesiune) | PASS |
| Like ca vizitator nelogat | 401 + invitație login | 401 primit, dar UI face doar revert silențios — fără prompt de login | **FAIL parțial → BACKLOG** (UX: deschide modal login la 401) |
| Redesign live pe swypik.com | action-bar în HTML | prezent, /en/explore = 200 | PASS |
