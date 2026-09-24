# Swypik — Social Commerce Platform

## Descriere
Swypik = platforma social commerce (TikTok Shop style) care combina video-uri scurte cu cumparaturi. Useri descopera produse prin video-uri, creatorii castiga comisioane, sellerii gestioneaza catalog importat din AliExpress.

## Tech Stack
- **Frontend:** Next.js 14 (App Router) + TypeScript + TailwindCSS + next-themes (dark mode)
- **Backend API:** Next.js API Routes (`app/api/`)
- **Platform API:** Go service la `services/platform-api/` — ACTIV pentru creator video upload + reverse_proxy Caddy
- **Database:** PostgreSQL 16 (Docker, `swypik-prod-postgres-1`)
- **Cache:** Redis 7 (Docker)
- **Storage:** Cloudflare R2 (video + imagini)
- **Payments:** Stripe (Checkout Sessions + Webhooks)
- **AI:** GitHub Models API (`https://models.github.ai/inference`) cu `GITHUB_TOKEN`. Fallback: OpenRouter. Vezi `lib/ai/moderation.ts`.
- **Edge:** Cloudflare Tunnel (`cloudflared`, systemd in distro) → `http://localhost:3005` (web-next). Caddy NU ruleaza local (profil `disabled` in `docker-compose.vps.yml`).
- **Deploy:** Docker Compose in distro-ul WSL2 `swypik` de pe masina asta (NU exista VPS Hetzner — actualizat 2026-09-22)

## Locatii reale (2026-09-22)
- **Hosting:** distro WSL2 `swypik` (disc `E:\wsl\swypik`), pe acest PC Windows. Nu exista VPS.
- **Clona live:** `/opt/swypik/app` in distro (owner `dev`, remote = GitHub `main`) — separata de repo-ul de lucru `E:\Swypik\swypik\app`.
- **Compose:** proiect `swypik-prod`, fisiere `infra/hetzner/docker-compose.prod.yml` + `docker-compose.vps.yml` + `docker-compose.minio.yml`, env `infra/hetzner/.env.production` (owner `dev`, 600).
- **DB:** `swypik-prod-postgres-1`, user `swypik`, db `swypik_prod`, port host `127.0.0.1:5433`; migrarile aplicate sunt in `schema_migrations(version = nume fisier fara .sql)`.
- **Keepalive:** `E:\Swypik\wsl-keepalive.ps1` tine distro-ul pornit cu o ancora `wsl -d swypik --exec sleep infinity` (o singura ancora; log `E:\Swypik\wsl-keepalive.log`).
- **GitHub:** `https://github.com/office233/swypik-commerce-platform.git`, branch principal `main`.
- **Live:** https://swypik.com

## Workflow (de aici inainte)
1. Editezi in `E:\Swypik\swypik\app`, pe branch de feature; gate-uri: `npx tsc --noEmit --incremental false`, `npx vitest run`, `npx next lint`, `node scripts/i18n-guard.mjs`, `npx next build`.
2. Merge in `main` + `git push origin main`.
3. Deploy: **un singur script**, `E:\Swypik\ops\deploy.bat` (sau, ca root in distro, `bash /mnt/e/Swypik/ops/deploy.sh [--flags "FEATURE_X FEATURE_Y"]`).
   Face: lock (un singur deploy o data), refuza clona live murdara, backup `pg_dump`, `git pull --ff-only origin main`,
   aplica toate migrarile neinregistrate in `schema_migrations`, build + recreate `web-next`, asteapta ca
   `/api/health` sa raporteze noul commit, smoke test. Rollback: imaginea `swypik-prod-web-next:rollback`.
   Nu se mai copiaza NICIODATA fisiere locale in productie (vechile `deploy-step-*.sh` faceau rsync din working tree — arhivate in `E:\Swypik\_arhiva\`).
4. WSL: daca `wsl.exe` da `HCS_E_CONNECTION_TIMEOUT` / `0x80072747`, serviciul WSL e blocat — repornire ca admin: `Restart-Service WslService -Force`.
   Nu rula doua deploy-uri in paralel (2026-09-24: doua build-uri simultane au blocat VM-ul si site-ul).

GitHub `main` = sursa de adevar; `/opt/swypik/app` e doar clona de rulare.

## Structura reala (post Val 3)
```
/opt/swypik/app/
├── app/                          # Next.js App Router
│   ├── api/                      # 101 route.ts files
│   │   ├── auth/                 # OTP email + sessions
│   │   ├── v1/feed/              # Feed ranking (cu seen_video_ids LRU)
│   │   ├── feed/events/batch/    # Tracking events (30+ tipuri)
│   │   ├── products/             # CRUD catalog
│   │   ├── checkout/             # Stripe Checkout
│   │   ├── webhooks/stripe/      # Stripe webhooks
│   │   ├── upload/session/       # Video upload (Go platform-api)
│   │   ├── chat/                 # AI chat (FEATURE_AI_CHAT_FULL)
│   │   ├── creator/              # Creator dashboard
│   │   ├── seller/               # Seller portal
│   │   ├── admin/                # Admin panel
│   │   ├── dm/                   # FROZEN (FEATURE_DM=0)
│   │   ├── push/                 # FROZEN (FEATURE_PUSH_NOTIFICATIONS=0)
│   │   ├── stripe-connect/       # FROZEN
│   │   ├── fulfillment/          # FROZEN
│   │   ├── returns/              # FROZEN
│   │   └── email-marketing/      # FROZEN
│   ├── explore/                  # Video feed
│   ├── movies/                   # Swypik Movies: catalog, serial, player (FEATURE_MOVIES)
│   ├── music/                    # Swypik Music: artisti, piese/albume, mini-player persistent (FEATURE_MUSIC)
│   ├── record/                   # Camera page (MediaRecorder, Val 3)
│   ├── account/                  # User profile + ThemeToggle
│   ├── checkout/success/         # cu PurchaseTracker
│   ├── seller/                   # Seller dashboard
│   ├── admin/                    # Admin panel
│   └── layout.tsx                # cu ThemeProvider
├── components/
│   ├── BottomNav.tsx             # 5 items: Acasa, Explore, Record, Inbox, Profil
│   ├── ProductFeed.tsx           # Feed + Raport button + sendFeedEvent
│   ├── ChatInterface.tsx         # AI chat full UI
│   ├── ThemeProvider.tsx         # next-themes wrapper
│   ├── ThemeToggle.tsx           # cycles dark/light/system
│   ├── PurchaseTracker.tsx       # fires purchase event la /checkout/success
│   └── ...
├── lib/
│   ├── ai/
│   │   ├── moderation.ts         # GitHub Models classifier
│   │   └── safety-filter.ts      # blocks weapons/drugs; tags adult-only
│   ├── feed/
│   │   └── track.ts              # batched sendBeacon emitter
│   ├── movies/                   # acces/pret (pure), unlock cu cardul (Stripe, RON) + cota creator, proxy HLS cu token
│   ├── music/                    # acces/pret (pure), unlock cu cardul (Stripe, RON), publish + sincronizare audio_tracks pentru reels
│   ├── media/                    # stream-token/path/secret, hls-rewrite — comun Movies + Music
│   ├── feature-flags.ts          # 8 flags (DM, push, AI chat, etc)
│   ├── feature-flags-client.ts   # client-side variant
│   ├── haptic.ts                 # navigator.vibrate wrapper
│   ├── social/
│   │   ├── session.ts            # getOptionalSocialUserId
│   │   └── proxy.ts              # → platform-api
│   ├── auth/getAuthUser.ts
│   ├── db.ts                     # pg Pool
│   ├── stripe/                   # Stripe SDK
│   ├── storage/                  # R2 client
│   └── ...
├── services/
│   └── platform-api/             # Go (ACTIV, NU sterge)
├── db/migrations/                # SQL migrations, numerotate strict
├── infra/hetzner/
│   ├── docker-compose.prod.yml   # NU `docker-compose.yml`
│   ├── Caddyfile                 # reverse_proxy platform-api:8080
│   ├── deploy.sh
│   └── .env.production
├── scripts/translate.mjs         # GitHub Copilot translator (ae_*)
└── workers/ (in lucru, era services/video-worker/)
```

## Baza de Date (Postgres)
- 79 tabele in `public` schema
- **Auth unified:** `users` (12, are coloana `role` shopper/creator/seller/admin) + `sellers` (entitate business separata) + `user_sessions`/`seller_sessions`. `lib/auth/getAuthUser.ts` = facade unic cu `requireRole()`. `customer_sessions` + `auth_accounts` = deprecated/dormant.
- **Catalog:** `marketplace_products` (14012), `ae_products` (14012), `ae_categories`, `ae_variants`
- **Video:** `videos` (4752), `creator_videos` (0), `video_assets`, `video_processing_jobs`, `video_upload_sessions`
- **Feed/Discovery:** `feed_events` (30+ event types), `user_feed_state` (seen_video_ids jsonb LRU max 500), `feed_items`, `user_interests`, `user_hidden_videos`
- **Topics taxonomy (Val 3):** `topics` (20 seeds), `product_topics`
- **Commerce:** `commerce_orders` (6), `commerce_order_items`, `carts`, `cart_items`, `commissions`, `commission_payouts`
- **Adult gating (Val 3):** `user_age_verifications`, `users.birth_date`, `users.age_verification_status`, `users.adult_content_opt_in`
- **Moderation:** `moderation_cases`, `moderation_reports`, `moderation_actions`
- **Tracking:** `schema_migrations` (version, applied_at) — strict numerotate `YYYYMMDD_NNNN_*`

### Conectare DB
```bash
docker exec -it swypik-prod-postgres-1 sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB"
```

## Feature Flags
Toate gated prin `lib/feature-flags.ts` (server) + `feature-flags-client.ts` (client):

| Flag | Status prod | Note |
|---|---|---|
| `FEATURE_DM` | OFF | Routes intoarce 410 |
| `FEATURE_PUSH_NOTIFICATIONS` | OFF | |
| `FEATURE_STRIPE_CONNECT` | OFF | |
| `FEATURE_FULFILLMENT` | OFF | |
| `FEATURE_RETURNS` | OFF | |
| `FEATURE_EMAIL_MARKETING` | OFF | |
| `FEATURE_SEO_PAGES` | OFF | |
| `FEATURE_AI_CHAT_FULL` | OFF | Necesita `GITHUB_TOKEN` in `.env.production` |
| `FEATURE_SQUAD_BUY` | OFF | Squad Buy — pana cand pretul de grup se aplica la checkout |
| `FEATURE_VIRAL_CATALOG` | OFF | Catalog demo de produse (date de exemplu) |
| `FEATURE_MOVIES` | OFF | Swypik Movies (+ `NEXT_PUBLIC_FEATURE_MOVIES`); migrarea `20260921_0003_movies.sql`; spec in `docs/superpowers/specs/2026-09-21-swypik-movies-design.md` |
| `FEATURE_MUSIC` | OFF | Swypik Music (+ `NEXT_PUBLIC_FEATURE_MUSIC`); migrarea `20260922_0001_music.sql`; spec in `docs/superpowers/specs/2026-09-21-swypik-music-design.md` |
| `FEATURE_NEWS` | OFF | Swypik AI News (+ `NEXT_PUBLIC_FEATURE_NEWS`); necesita `GEMINI_API_KEY` |
| `FEATURE_GAMING` | OFF | Swypik Arcade (+ `NEXT_PUBLIC_FEATURE_GAMING`) |
| `FEATURE_MESSENGER` | OFF | Swypik Messenger — mesaje & apeluri video (+ `NEXT_PUBLIC_FEATURE_MESSENGER`); apelurile video necesita `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`/`LIVEKIT_URL`/`NEXT_PUBLIC_LIVEKIT_URL` |

Crypto/SWYP eliminat 2026-09-25 pentru eligibilitate NVIDIA Inception — tabelele DB rămân, neutilizate.

Toate flag-urile de mai sus sunt OFF implicit (opt-in explicit). Pentru module noi
(`movies`/`music`/`news`/`gaming`/`messenger`), perechea `FEATURE_X` +
`NEXT_PUBLIC_FEATURE_X` trebuie setata AMBELE la BUILD TIME (build arg in
`infra/hetzner/docker-compose.prod.yml`, nu doar in `.env.production` la
runtime) — altfel paginile index prerandate si bundle-ul de browser raman
"ascunse" chiar daca flag-ul server e pornit (vezi comentariul din
`lib/feature-flags-client.ts`).

## Containere Docker (prod)
- `swypik-prod-web-next-1` — Next.js (port 3000 intern)
- `swypik-prod-platform-api-1` — Go (port 8080, video upload + creator video)
- `swypik-prod-postgres-1` — Postgres 16
- `swypik-prod-redis-1` — Redis 7
- `swypik-prod-caddy-1` — HTTPS + reverse proxy
- `swypik-prod-video-worker-1` — Python FFmpeg pipeline
- `swypik-prod-cron-worker-1` — cron jobs (Alpine)

## Conventii cod
- TypeScript strict mode (in lucru, 268 `: any` raman, vezi Faza 6)
- TailwindCSS dark mode `class` strategy (next-themes)
- API routes: `app/api/[resource]/route.ts` (GET/POST/PUT/DELETE)
- DB: raw SQL prin `lib/db.ts` dbQuery (pg Pool), NU ORM
- Auth: cookie-based sessions cu SHA-256 hashed tokens
- Logging: `lib/logger.ts` (in propagare, raman 69 `console.log`)
- Env vars: NUMAI in `infra/hetzner/.env.production`

## REGULI IMPORTANTE
1. **EDIT in `E:\Swypik\swypik\app`**, deploy din clona `/opt/swypik/app` (WSL) — vezi Workflow
2. **NU modifica `.env.production` direct** — cere confirmare (exceptie: flag-urile unei lansari aprobate explicit)
3. **Migration files**: numerotate strict `YYYYMMDD_NNNN_descriere.sql`, recorded in `schema_migrations`
4. **NU sterge tabele/coloane** fara backup `pg_dump`
5. **Mobile-first design** — UI optimizat pentru mobil (BottomNav 5 items)
6. **Deploy:** rebuild web-next + `up -d --force-recreate --no-deps web-next`
7. **GitHub Models** pentru AI, NU OpenRouter (per user-memory)
8. **Go platform-api** este ACTIV — nu sterge

## Fluxuri principale
1. **Discovery:** `/` → `/explore` (video feed cu seen_video_ids LRU) → swipe → tap product → `/checkout` Stripe
2. **Creator:** apply → upload video via `app/api/creator/upload-session` (→ platform-api Go) → comision la vanzari
3. **Seller:** dashboard → import AliExpress → catalog → orders
4. **Admin:** `/admin` → moderation cases / users / products / orders
5. **AI chat:** `/chat` → GitHub Models → moderation output filter

## TODO restant (per plan Faza 0-6, 2026-05-14)
- ✓ Faza 0 Backup (mvp-freeze pushed)
- ✓ Faza 1 Junk cleanup
- ✓ Faza 2 Go decision (PASTREAZA)
- ✓ Faza 5 CLAUDE.md sync (acest commit)
- ⏳ Faza 3 Folder reorg (route groups marketing/shop/account/seller/admin)
- ✓ Faza 4 Auth unified (deja era, doar backfill 2 customers + docs sync)
- ⏳ Faza 6 Code quality (logger propagation, type strict)

## URL-uri Production
- Site: https://swypik.com
- API: https://swypik.com/api/*
- Sitemap: https://swypik.com/sitemap.xml
