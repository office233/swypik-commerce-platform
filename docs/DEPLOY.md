# Deploy Swypik (apps/web — Next.js)

Ghid operațional: variabile de mediu, chei, cron, webhook-uri Stripe, migrări.

---

## 1. Verificarea configurației

Înainte de orice deploy:

```bash
NODE_ENV=production node scripts/check-env.mjs
```

Scriptul iese cu cod `1` dacă lipsesc variabile obligatorii. Citește `.env.local` apoi `.env`
(fără să suprascrie variabilele deja prezente în mediu), deci funcționează și în CI unde
variabilele vin din secret store.

---

## 2. Variabile obligatorii

| Variabilă | Rol |
| --- | --- |
| `DATABASE_URL` | conexiune PostgreSQL (`postgresql://user:pass@host:port/db`) |
| `APP_ENCRYPTION_KEY` | criptare tokenuri sociale + semnare linkuri unsubscribe. Generare: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | URL public canonic (linkuri e-mail, redirect-uri) |

Obligatorii **doar în producție** (în dev au fallback-uri locale):

| Variabilă | Rol |
| --- | --- |
| `CRON_SECRET` | autentifică rutele `/api/cron/*` (`Authorization: Bearer $CRON_SECRET`) |
| `STRIPE_SECRET_KEY` | plăți |
| `STRIPE_WEBHOOK_SECRET` | verificarea semnăturii webhook Stripe |
| `OAUTH_REDIRECT_BASE` | baza pentru callback-urile OAuth |
| `STUDIAI_BASE_URL`, `STUDIAI_API_KEY` | gateway LLM (fără fallback în producție) |
| `GO_API_URL` | platform API Go (upload video, feed) |

> În dev, `GO_API_URL` cade pe `http://localhost:8080`, `OAUTH_REDIRECT_BASE` pe
> `http://localhost:3000`, `STUDIAI_BASE_URL` pe gateway-ul public. În producție lipsa lor
> produce un **log de eroare explicit** (nu crash silențios).

## 3. Variabile recomandate / de business

| Variabilă | Default | Rol |
| --- | --- | --- |
| `CREATOR_COMMISSION_BPS` | `500` | comision creator, în basis points (500 = 5%) |
| `PAYOUT_MIN_CENTS` | `5000` | prag minim retragere curieri (cenți) |
| `PLATFORM_USER_ID` | id determinist din migrarea `20260730_0013` | cont tehnic pentru comisioane în `wallet_ledger` |
| `DEFAULT_TIMEZONE` | `Europe/Bucharest` | fus orar implicit (i18n + misiuni zilnice) |
| `LIVE_RTMP_HOST` / `LIVE_HLS_HOST` | `swypik.com` (doar dev) | hosturi live streaming |
| `SOCIAL_API_URL` | fallback `GO_API_URL` | proxy către API-ul social |
| `FEED_EVENT_IP_SALT` | valoare implicită | salt pentru hashing IP la evenimente feed |
| `RESEND_API_KEY` | – | e-mailuri tranzacționale; fără el, e-mailurile doar se loghează |
| `GOOGLE_MAPS_API_KEY` | – | estimări rută (fallback: haversine) |

### Recomandare pentru un pas ulterior

Constantele din `lib/dispatch/engine.ts` (`OFFER_TTL_SECONDS`, `WAVE_RADII_KM`,
`MAX_COURIERS_PER_WAVE`) ar trebui mutate în env. **Nu au fost modificate** aici pentru a evita
conflicte cu munca în curs pe motorul de dispatch.

---

## 4. Chei VAPID (push web)

```bash
npx web-push generate-vapid-keys
```

Setează:

```
VAPID_PUBLIC_KEY=BM...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contact@swypik.com
```

Cheia publică este servită clientului prin `GET /api/push/vapid-public-key`. Dacă lipsesc,
push-ul este dezactivat cu un warning în loguri (nu blochează aplicația).

---

## 5. Cron

### `/api/cron/dispatch-tick` — la fiecare 10 secunde

Expirarea ofertelor către curieri **nu** poate fi doar client-side. Rulează un cron extern
(systemd timer nu coboară sub 1s util aici; cel mai simplu e o buclă în systemd sau un
`while` cu `sleep 10`):

`/etc/systemd/system/swypik-dispatch-tick.service`:

```ini
[Unit]
Description=Swypik dispatch tick (10s)

[Service]
Type=simple
Environment=CRON_SECRET=__PUNE_SECRETUL__
Environment=APP_URL=https://swypik.com
ExecStart=/bin/bash -c 'while true; do curl -fsS -m 8 -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/dispatch-tick" >/dev/null || true; sleep 10; done'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now swypik-dispatch-tick
```

### Restul cron-urilor (crontab clasic)

```cron
*/5  * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://swypik.com/api/cron/process-dropship
*/15 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://swypik.com/api/cron/swyp-view-milestones
```

Toate rutele `/api/cron/*` compară secretul în timp constant (`timingSafeEqual`).

---

## 6. Webhook-uri Stripe

Endpoint principal: `https://swypik.com/api/webhooks/stripe` → secret în `STRIPE_WEBHOOK_SECRET`.

Evenimente de înregistrat:

- `checkout.session.completed`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `account.updated` (Stripe Connect — onboarding creatori/curieri)
- `charge.dispute.created` / `.updated` / `.closed` / `.funds_withdrawn` / `.funds_reinstated`

Endpoint separat pentru identitate: `https://swypik.com/api/webhooks/stripe-identity`
(secret propriu), cu evenimentele:

- `identity.verification_session.verified`
- `identity.verification_session.requires_input`
- `identity.verification_session.canceled`

Evenimentele sunt deduplicate în tabela `processed_stripe_events` (idempotent la retry-uri Stripe).

---

## 7. Migrări pe producție

```bash
# dry-run: vezi ce s-ar aplica
npm run db:status

# aplică migrările
DATABASE_URL="postgresql://..." npm run db:migrate
```

Ordinea recomandată la deploy:

1. `node scripts/check-env.mjs` (cod 0)
2. backup DB (`pg_dump`)
3. migrări
4. `npm run build`
5. restart aplicație
6. smoke test: `/api/health`, login, un checkout de test

---

## 7b. Deploy pe producție (WSL) — și capcana deploy-ului parțial

**Producția rulează în WSL local**, distro `swypik`, containere `swypik-prod-*`.
Nu pe VPS extern. Repo-ul de deploy e `/opt/swypik/app`, un clone separat care
trage din `origin` — deci **orice commit trebuie mai întâi `git push`**, altfel
`git pull` de pe prod nu are ce aduce.

```bash
bash scripts/wsl-deploy-web.sh                    # tot codul de aplicație
bash scripts/wsl-deploy-web.sh web-next           # doar un serviciu
bash scripts/wsl-deploy-web.sh video-worker cron-worker
NO_PULL=1 bash scripts/wsl-deploy-web.sh          # fără git pull
```

### Serviciile care conțin cod din repo

Doar acestea au `build:` în compose și pot rămâne în urmă la un deploy parțial:

| Serviciu | Context de build | Ce conține |
| --- | --- | --- |
| `web-next` | `/opt/swypik/app` | Next.js: `app/`, `lib/`, `components/`, rutele API |
| `platform-api` | `services/platform-api` | Go: upload video, feed |
| `video-worker` | `workers/video-worker` | Python: transcodare HLS (3 replici) |
| `cron-worker` | `infra/hetzner/cron-worker` | `run.sh` — declanșatorul joburilor cron |

Restul sunt imagini externe pinned (`postgres`, `redis`, `minio`, `mediamtx`) sau
dezactivate prin `profiles: [disabled]` (`caddy`, `pgbouncer`). Nu se reconstruiesc.

### ⚠️ Capcana: „deploy reușit" ≠ „cod nou în producție"

Două incidente reale, același tipar:

- **10 august** — `git pull` a raportat „Already up to date", dar imaginea
  `web-next` era veche de 22 de ore. Commit-ul era pushed; containerul rula cod vechi.
- **17 august** — deploy-ul a reconstruit corect `web-next`, dar scriptul de atunci
  avea hardcodat `up -d --build web-next`. Fix-ul **P1-01** (timeout `ffmpeg`, care
  împiedică blocarea întregii cozi de transcodare) stătea de 2 zile în `main`,
  comis și pushed, **fără să ruleze**. Imaginea `video-worker` era din 10 august.

De ce nu se observă: `git pull` reușește, `docker compose up` iese cu 0,
containerul e `healthy`, site-ul răspunde 200. Niciun semnal de eroare.

**Regula: singura dovadă că s-a livrat cod nou e schimbarea hash-ului imaginii.**
Scriptul o verifică automat și iese cu cod ≠ 0 dacă vreun serviciu atins a rămas
pe același hash. Nu te baza pe absența erorilor.

### Verificare manuală după deploy

```bash
# hash + data imaginii
docker inspect --format='{{.Image}} {{.Created}}' swypik-prod-web-next-1
docker inspect --format='{{.Image}} {{.Created}}' swypik-prod-video-worker-1

# build id-ul Next.js (se schimbă la fiecare build)
docker exec swypik-prod-web-next-1 sh -c 'cat .next/BUILD_ID'

# fix-ul e chiar în bundle? (exemplu: un string introdus de fix)
docker exec swypik-prod-web-next-1 sh -c "grep -rl 'video_not_available' .next/server | head -3"

# pentru workerii Python, verifică fișierul sursă din container
docker exec swypik-prod-video-worker-1 sh -c "grep -n 'FFMPEG_TIMEOUT_SECONDS' /app/video_worker/ffmpeg_tools.py"
```

Dacă hash-ul a rămas identic, forțează:

```bash
cd /opt/swypik/app
docker compose -f infra/hetzner/docker-compose.prod.yml \
  -f infra/hetzner/docker-compose.vps.yml \
  -f infra/hetzner/docker-compose.minio.yml \
  --env-file infra/hetzner/.env.production \
  build --no-cache <serviciu>
```

### Ordinea la un deploy cu migrație

Migrația **înaintea** deploy-ului, dacă noul cod scrie valori pe care schema veche
le respinge. Exemplu concret: `runCron` a început să scrie `status='skipped'` în
`cron_runs`, valoare pe care `cron_runs_status_check` nu o accepta încă —
deploy-ul înainte de migrație ar fi produs erori la fiecare skip.

După orice migrație, resincronizează oglinda schemei:

```bash
bash scripts/db/check-schema-drift.sh --write && git add db/schema.sql
```

---

## 8. Note de securitate

- Toți identificatorii publici (slug-uri, token-uri de claim) sunt generați cu
  `crypto.randomUUID()` / `randomBytes`, nu cu `Math.random()`.
- Nu comite `.env.local`. Secretele stau în secret store-ul platformei de hosting.
- Rotația `APP_ENCRYPTION_KEY` invalidează tokenurile sociale criptate — planifică re-autentificare.
