# Swypik — instrucțiuni globale pentru TOȚI agenții

## ⚠️ SCHIMBARE MAJORĂ 2026-08-01: totul rulează LOCAL, nu pe VPS!
- **VPS 178.105.46.66 NU mai are nimic Swypik/multi-erp** (șters definitiv). Acolo e DOAR Meister ERP — nu-l atinge.
- Producția: WSL distro `swypik` pe acest PC → servită public prin **Cloudflare Tunnel** → https://swypik.com
- Cod sursă (unde editezi): `E:\Meister\swypik\app` → commit → push `origin main`
- Deploy: `wsl -d swypik` → `cd /opt/swypik/app && git pull origin main` → rebuild (vezi `scripts/deploy/wsl-build-web.sh` + `wsl-start-web.sh`)
- Test rapid local: http://localhost:3005 · Verificare completă: `scripts/wsl-final-check.sh`

## Reguli tehnice
- PowerShell strică quoting-ul la `wsl -- bash -c "..."` cu JSON/`&&` → scrie script în `scripts/*.sh`, apoi: `wsl -d swypik -- bash -c "sed 's/\r//' /mnt/e/Meister/swypik/app/scripts/X.sh > /tmp/x.sh && bash /tmp/x.sh"`
- DB: `wsl -d swypik -- docker exec swypik-prod-postgres-1 psql -U swypik -d swypik_prod ...`; migrări în `db/migrations/`, aplicate manual.
- După orice schimbare de cod: `npx tsc --noEmit` înainte de commit.
- NU închide fereastra minimizată „WSL-Swypik" și NU da dublu-clic pe fișiere .vhdx — site-ul cade (Error 1033).
- Chain: nu regenera genesis/keystore niciodată (istoric real pe chaindata). RPC intern WSL: 172.17.0.1:8545.

## Direcție produs
- Plan: `docs/VIDEO_COMMERCE_ROADMAP.md` — „video sells everything" (clip → produs/masă/cameră/cursă, comision creator on-chain).
- 5 verticale active: Video, Shop, Food, Stays, Go. NU adăuga verticale noi.
- SWYP = puncte de loialitate closed-loop (nu limbaj crypto/MiCA).
- Stripe Connect amânat (nu există cont) — payouts manual/SWYP.

## Agenți specializați (folosește-l pe cel potrivit)
- `swypik-video` — feed, reels, ranking, video-workers
- `swypik-commerce` — Shop, Food, Stays, Go, checkout, selleri/merchanti
- `swypik-chain` — SWYP wallet/mining/staking, geth, Blockscout
- `swypik-infra` — WSL, Docker, tunel Cloudflare, cron, deploy
