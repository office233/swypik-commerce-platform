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


## 2026-08-02 — P1 Creator (browser real, mobil 390×844)

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| Signup 4 pași (`test-creator@swypik.test`, Teodor Creator, @teo_creator_test) | cont creat | wizard complet, validare username live, cont creat + redirect login | PASS |
| Login pe http://localhost:3005 | sesiune activă | API `/api/auth` 200 dar sesiunea nu persistă — cookie `Domain=swypik.com; Secure` (build prod). NU e bug: testarea autentificată se face pe https://swypik.com | N/A (limitare mediu, documentată) |
| Login pe https://swypik.com | /account | PASS — profil complet: avatar fallback, 0/0/0 contoare, "Modurile mele", banner confirmare email, welcome modal | PASS |
| Observație UX | eroare vizibilă la login eșuat local | formularul se golește fără niciun mesaj de eroare când fetch-ul nu setează cookie | BACKLOG (afișare eroare la login failure) |
| /account/edit — chei i18n | toate textele traduse | `MISSING_MESSAGE: accountEdit.displayName/linkLabelPlaceholder/removeLink` în consolă | FAIL → FIXED (180aa17d, ×7 limbi) |
| /account/edit — buton Salvează pe mobil 390×844 | click funcțional | butonul era ACOPERIT de bottom-nav (bara fixă z-20 sub nav z-30) — click interceptat, imposibil de salvat de pe telefon | **FAIL → FIXED** (fbd2cf9a: bara ridicată la `bottom-16` + safe-area, z-40) |
| Completare bio + categorii (date reale) | persistă după reload | în curs de re-test după deploy fix | ÎN CURS |
| Salvare profil (bio + categorii) | ambele persistă | categoriile persistă; **bio se pierdea la fiecare salvare**: `GET /api/auth` nu returna `bio`, deci edit-page pornea mereu cu bio="" și PATCH-ul îl golea în DB | **FAIL → FIXED** (eab68282: bio adăugat în SELECT + payload `/api/auth`) |
| Buton Salvează după fix z-index | click OK | Playwright „element not stable" persistent din cauza bannerului email care re-randează; submit prin `form.requestSubmit()` merge → redirect `/account?updated=1` | PASS cu notă (bannerul face layout shift — BACKLOG minor) |
| Re-test bio după fix eab68282 | bio persistă după reload | „Creator de test — clipuri tech și lifestyle. Cont E2E." prezent la reload + pe profilul public | **PASS** |
| Profil public `/u/teo_creator_test` (logat, ca owner) | bio + categorii + contoare | complet: avatar TC, bio, #tech #lifestyle, 0/0/0/0, link „Profilul tau" → /creator, empty-state clipuri corect | PASS |
| Observație i18n profil public | texte traduse | „URMARITORI", „Nu exista clipuri publice" — RO fără diacritice, hardcodat (nu next-intl) | BACKLOG (lot i18n pagina /u/[username]) |
| Profil văzut de vizitator NELOGAT (curl swypik.com) | identic + buton Follow | bio + #tech #lifestyle prezente, `isOwnProfile:false`, buton „Urmareste"/Follow, OG meta corecte (og:title, og:description=bio) | PASS |

## 2026-08-02 — P1b Upload clip (browser real)

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| /reels/record pe desktop fără cameră | fallback spre upload | „Camera indisponibilă" + doar „Reîncearcă" — fără link spre /upload | BACKLOG UX (adaugă buton „Încarcă din galerie") |
| /upload — selectare fișier (clip generat ffmpeg 720×1280, 6s, 2.4MB) | preview + Continuă | fișier acceptat, buton Continuă activ | PASS |
| Click Continuă → upload | progres + procesare | **blocat silențios**: `/api/creator/upload-session` returna presigned URL pe `http://swypik-minio:9000` (hostname intern Docker) — browserul nu-l poate accesa; XHR eșua fără mesaj | **FAIL P0 → FIXED** (cd013c42: presign semnat pe endpoint public `S3_UPLOAD_PUBLIC_ENDPOINT=https://cdn.swypik.com`, tunel CF → MinIO; env adăugat în .env.production prin append) |
| Re-test upload după fix | clip urcat + procesat de video-worker | în curs | ÎN CURS |
| Re-test upload cap-coadă după cd013c42 | presign pe host public, upload OK, HLS, publish | presign → `cdn.swypik.com` ✅; upload PUT OK; „Procesarea s-a încheiat" în <5s; detalii (titlu+descriere `#test #tech`) → Publică → `/creator/videos` arată clipul cu badge GATA | **PASS** |
| Clip pe profilul public | apare în grid | „1 clip public", card cu link `/explore?v=<id>`, contoare 1 CLIPURI | PASS |
| Deep-link `/explore?v=<id>` | feed-ul deschide clipul respectiv | feed-ul se încarcă cu rail nou, dar clipul țintit nu e adus primul (creator negăsit în primele slide-uri) | BACKLOG (verificare parametru `v` în ExploreClient) |
| Notă Playwright | — | butoanele din /upload dau „element not stable" (preview video re-randează); click programatic funcționează — nu blocează utilizatorii reali | notă |

## 2026-08-02 — P2 Shopper + interacțiuni cross-account

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| Signup al 2-lea cont (`test-shopper@swypik.test`, @sonia_shopper_test) prin UI | cont creat + auto-login | wizard 4 pași OK → `/account` | PASS |
| Follow @teo_creator_test din contul shopper | contor crește, buton devine „Urmărești" | profil creator: „1 URMARITORI", „Urmaresti" | PASS |
| Deep-link `/explore?v=<id>` după fix dae0ee00 | clipul creatorului primul | API pin OK; primul slide = clipul țintă cu rail-ul nou | PASS |
| Like de la shopper | contor 0→1, persistă | `aria-pressed=true`, count=1; confirmat prin API (`viewer.liked=true`) | PASS |
| Comentariu de la shopper (bottom-sheet) | apare cu autor | „1 total", card „Sonia Shopper", contor rail 0→1 | PASS |
| Verificare din contul creator | contoare identice | API: likes=1, comments=1; `/creator/videos`: clip Live | PASS |
| Curățenie | — | 2 înregistrări orfane „AȘTEPTARE" (probe.mp4 din probă API + upload eșuat pre-fix) — de curățat via watchdog-videos | notă |
| Notă infra | — | Service worker PWA servește bundle vechi după deploy (feed-ul ignora `v=` până la reload dublu) | BACKLOG (SW skipWaiting/versionare) |

## 2026-08-02 — P3 Shop: coș + checkout (shopper)

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| Adăugare „Zbor spre Barcelona" în coș din feed | în coș sau mesaj clar | API refuză corect (`listing_type=listing` → „Folosește formularul de contact") dar UI-ul NU arată nimic — click fără feedback | BACKLOG UX (toast cu mesajul de eroare la Coș din feed) |
| Adăugare produs real (Smart TV 55", 2499,99 RON, `listing_type=product`) | în coș | `/api/cart/items` 200, `/cart` afișează produsul, subtotal corect, livrare gratuită | PASS |
| `/checkout` | formular Stripe | **pagină complet goală** + `IntegrationError: Please call Stripe() with your publishable key. You used an empty string` — `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` nu era transmis ca build-arg, deci bundle-ul client avea "" | **FAIL P0 → FIXED** (c96ef8b5 + cdd424b4: ARG/ENV în build stage; cheia era deja în .env.production) |
| Re-test checkout după rebuild | Stripe Elements se încarcă | în curs | ÎN CURS |
| Re-test checkout după rebuild cu build-arg | pagina se randează | PASS: „Swypik Checkout" complet — produs, cantitate +/−, sumar, total 2.499,99 RON, iframe-uri Stripe încărcate (3) | PASS |
| Payment intent | client_secret | 401 de la Stripe: `STRIPE_SECRET_KEY=sk_placeholder` în .env.production — NU există chei reale de test în mediu. UI-ul tratează grațios („Plățile cu cardul nu sunt disponibile momentan"). | **LIMITARE MEDIU** — documentat în BACKLOG: setați chei Stripe test (sk_test_/pk_test_) și re-testați plata cu 4242 4242 4242 4242 |

## 2026-08-02 — P4 Fly (shopper, mobil)

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| `/fly` — pagină + destinații populare cu prețuri live | se încarcă | grid destinații (Viena, Barcelona…), form căutare complet | PASS |
| Click destinație Viena → căutare | rezultate reale | 20 zboruri Duffel/Lufthansa OTP→VIE, filtre (directe/ieftine/rapide), prețuri finale RON | PASS |
| Selectare zbor 373,51 RON | formular pasageri | „Pasageri & plată" cu câmpuri complete; validare corectă (butoanele Wallet/Card dezactivate până la completare) | PASS |
| Completare date pasager + Card | rezervare/plată | POST `/api/fly/orders` → 500: aceeași cheie `sk_placeholder`; UI arată clar „Rezervarea a eșuat" | LIMITARE MEDIU (aceeași cheie Stripe; fluxul e corect până la plată) |

## 2026-08-02 — P5 Food + P6 Go (shopper, mobil)

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| `/food` | listă restaurante | „Restaurantul Țest QA" afișat, badge ÎNCHIS, 45–60 min, livrare gratuită — comanda nu se poate testa (restaurantul e închis; corect ca logică de program) | PASS parțial (comanda blocată de program — de testat cu restaurant deschis) |
| `/go` — adrese cu autocomplete | sugestii geocoding | sugestii reale (Nominatim) pentru Piața Unirii + Otopeni | PASS |
| Estimare cursă | prețuri pe categorii | Economy 72 / Comfort 98 / Van 125 RON, ~49 min • 20.3 km | PASS |
| Comandă Economy | cursă creată + dispatch | ride `f93070a8` creat, ecran „Căutăm un șofer în zonă… (2 km)" cu timer, SOS 112, Distribuie cursa | PASS |
| Anulare gratuită | cursă anulată | „Cursă anulată — Anulare gratuită" + chestionar motiv | PASS |
| Notă UX | — | după anulare, dialogul „De ce anulezi?" rămâne cu „Anulează cursa" disabled — ordinea e ciudată (anularea s-a făcut deja) | BACKLOG minor |
## 2026-08-02 — Redesign Explorează TikTok-style

| Pas | Așteptat | Observat | Verdict |
|---|---|---|---|
| Crawl re-test după fix middleware | /cauze /developers /apps = 200 | 200/200/200, crawl complet 0 FAIL | PASS |
| Redesign: action rail dreapta (avatar+follow, like, comentarii, save, share cu contoare), snap-scroll, CommentsSheet bottom-sheet | UI TikTok-style pe mobil 390×844 | Rail vizibil cu toate 5 acțiunile, contoare 0 (date reale), cockpit produs păstrat cu Alternative+Cart; UI vechi „Merită/Nu merită"+coin-burst ELIMINAT din cod (commit 67d315ec) | PASS |
| Verificare vizuală screenshot mobil | fără suprapuneri, gradient ok | OK (screenshot în sesiune) | PASS |
| Like ca vizitator nelogat | 401 + invitație login | 401 primit, dar UI face doar revert silențios — fără prompt de login | **FAIL parțial → BACKLOG** (UX: deschide modal login la 401) |
| Redesign live pe swypik.com | action-bar în HTML | prezent, /en/explore = 200 | PASS |
