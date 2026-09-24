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

## Direcție produs
- Plan: `docs/VIDEO_COMMERCE_ROADMAP.md` — „video sells everything" (clip → produs/masă/cameră/cursă).
- 5 verticale active: Video, Shop, Food, Stays, Go. NU adăuga verticale noi.
- Crypto/SWYP eliminat 2026-09-25 pentru eligibilitate NVIDIA Inception — tabelele DB rămân, neutilizate.
- Stripe Connect amânat (nu există cont) — payouts manual.

## Agenți specializați (folosește-l pe cel potrivit)
- `swypik-video` — feed, reels, ranking, video-workers
- `swypik-commerce` — Shop, Food, Stays, Go, checkout, selleri/merchanti
- `swypik-infra` — WSL, Docker, tunel Cloudflare, cron, deploy
