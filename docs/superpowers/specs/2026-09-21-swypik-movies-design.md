# Swypik Movies — design (propunere, așteaptă aprobare)

**Data:** 2026-09-21 · **Stare:** DRAFT — nicio linie de cod scrisă încă · **Autor:** Claude (pe baza cererii „reel movie ca Reel Drama, dar mult mai bine")

## 1. Ce am înțeles din cerere

- **Ce:** un vertical nou, „Swypik Movies": micro-seriale verticale (9:16), episoade scurte, consumate prin swipe, în stilul ReelShort / DramaBox / Reel Drama.
- **De ce:** retenție zilnică (binge) + o sursă nouă de venit, în interiorul super-app-ului existent.
- **„Mult mai bine":** interpretez ca (a) fără reclame forțate și fără dark patterns, (b) integrare cu comerțul Swypik — „cumpără ce vezi în scenă", (c) monetizare prin economia SWYP deja existentă, (d) subtitrări multilingve (pipeline-ul de captions există), (e) reluare de unde ai rămas, pe orice dispozitiv.

**Presupuneri pe care le-am făcut** (corectează-mă):
1. Conținutul vine inițial din **admin** (serialele licențiate/produse de Swypik sau parteneri); creatorii primesc acces într-o fază ulterioară.
2. Primele **N episoade sunt gratuite** (N per serial, implicit 3), restul se deblochează cu **SWYP** (per episod sau tot sezonul). Plata în RON prin Stripe pentru „Movies Pass" este fază 2.
3. Episoadele folosesc **pipeline-ul video existent** (upload → R2 → worker FFmpeg → HLS → moderare), deci un episod este un rând în `videos`.
4. Conținutul adult trece prin **gating-ul de vârstă existent** (`users.age_verification_status`, `is_adult`).

## 2. Întrebări deschise (decizii de produs, nu tehnice)

| # | Întrebare | Opțiuni | Recomandarea mea |
|---|---|---|---|
| Q1 | Cine publică seriale? | (a) doar admin; (b) admin + creatori verificați („Studio"); (c) orice creator | **(a) în MVP**, (b) în faza 2 |
| Q2 | Cum se plătesc episoadele blocate? | (a) SWYP per episod + preț sezon; (b) abonament Stripe „Movies Pass"; (c) ambele | **(a) în MVP** (ledger-ul SWYP există, e idempotent), (c) în faza 2 |
| Q3 | Câte episoade gratuite implicit și cât costă un episod? | valori inițiale | 3 gratuite; preț per episod setat de admin per serial (ex. 5 SWYP), sezon = 60 % din suma episoadelor |
| Q4 | Unde intră în navigație? | (a) tab nou în EcosystemBar/sidebar; (b) înlocuiește „Inbox" în BottomNav; (c) tab „Movies" în Explore | **(a)** la lansare; (b) doar dacă vrei să-l împingi tare |
| Q5 | Lungimea maximă a unui episod? | 60 s / 120 s / 180 s / 5 min | **180 s** (2 fișiere HLS/episod, buffer rapid) |
| Q6 | Episoadele blocate: URL-uri semnate cu expirare (paywall real) sau doar UI? | | **URL-uri presemnate R2** (dependența `@aws-sdk/s3-request-presigner` există deja); altfel paywall-ul e decorativ |

## 3. Abordări evaluate

**A. Tabele dedicate + reutilizarea `videos` (recomandat).** `movie_series` / `movie_episodes` proprii, fiecare episod referă `videos.id`. Player, moderare, captions, like/comment, `video_product_links` (shop-the-scene) funcționează fără modificări. Cost: două tabele noi + gating de redare.

**B. Totul în `videos` + `metadata.kind='movie'`.** Zero migrări, dar seria/episodul/ordinea/prețul ajung în JSON netipizat, interogările de catalog devin lente și fragile, iar paywall-ul e greu de garantat. Respins.

**C. Serviciu separat (Go platform-api).** Izolare bună, dar dublează auth, ledger, i18n și dublează efortul de MVP. Respins pentru MVP; poate găzdui transcodarea în viitor.

## 4. Design (abordarea A)

### 4.1 Model de date (migrare `20260922_0001_movies.sql`)

```
movie_series
  id uuid PK · slug text UNIQUE · title · synopsis · genres text[] · language_code
  cover_url (16:9) · poster_url (9:16) · status draft|published|archived
  free_episodes int DEFAULT 3 · episode_price_units bigint · season_price_units bigint
  is_adult bool · owner_user_id uuid → users · published_at · created_at · updated_at

movie_episodes
  id uuid PK · series_id → movie_series ON DELETE CASCADE · episode_number int
  video_id uuid → videos (UNIQUE) · title · duration_ms · is_free_override bool NULL
  status draft|published · created_at · updated_at
  UNIQUE (series_id, episode_number)

movie_unlocks
  id uuid PK · user_id → users · series_id → movie_series · episode_id → movie_episodes NULL (NULL = sezon întreg)
  units_paid bigint · ledger_ref text · created_at
  UNIQUE (user_id, episode_id) · index (user_id, series_id)

movie_watch_progress
  user_id · episode_id · position_ms · completed bool · updated_at
  PK (user_id, episode_id)
```

Regula de acces (funcție pură, testată unitar): `canPlay(user, series, episode) = episode.number ≤ series.free_episodes || episode.is_free_override || unlock(episode) || unlock(season)`.

### 4.2 API (Next.js route handlers, toate cu `withErrorHandling`, zod, rate-limit)

| Rută | Rol |
|---|---|
| `GET /api/movies` | catalog: `?genre=&sort=trending|new&cursor=`; doar `published`, fără `is_adult` dacă userul nu e verificat |
| `GET /api/movies/[slug]` | serial + lista episoadelor cu `locked: boolean` calculat pe server + progresul userului |
| `GET /api/movies/[slug]/episodes/[n]/play` | **singurul** loc care întoarce URL-ul de redare; pentru episoade blocate răspunde 402 `{ reason: "locked", priceUnits }`; pentru cele permise întoarce URL presemnat (TTL 10 min) |
| `POST /api/movies/[slug]/unlock` | `{ episodeId }` sau `{ season: true }` → `spendSwyp` cu `refType: "movie_unlock"`, `refId: user:episode` (idempotent); 402 `insufficient_balance` |
| `POST /api/movies/progress` | `{ episodeId, positionMs, completed }` (batch la 5 s, `sendBeacon`) |
| `GET/POST/PATCH /api/admin/movies`, `/api/admin/movies/[id]/episodes` | CRUD admin; episodul se creează dintr-un `video_id` deja `ready` |

### 4.3 UI (`app/[locale]/movies/…`, mobile-first)

- **`/movies`** — grilă de postere 9:16, rânduri „Continuă să vezi", „Trending", „Noi", filtre pe gen. RSC cu primul lot server-side (ca `/explore`).
- **`/movies/[slug]`** — poster mare, sinopsis, buton „Vezi episodul 1" / „Continuă (ep. 7)", grilă de episoade cu lacăt + preț, „Deblochează sezonul".
- **`/movies/[slug]/[n]`** — player vertical full-screen (reutilizează `useHlsVideo` + scroll-snap din `ExploreClient`): swipe în jos = episodul următor; overlay cu titlu, „Ep. 7/40", like/comment (endpoint-urile `videos/[id]/…`), „Cumpără din scenă" (produsele din `video_product_links`), subtitrări (captions existente). La un episod blocat, slide-ul devine un paywall: preț, sold SWYP, „Deblochează" / „Deblochează sezonul".
- Progresul se salvează la 5 s și la părăsirea paginii; reluarea sare la `position_ms`.
- Toate textele prin `next-intl` în cele 7 locale de la prima linie (namespace `movies`).

### 4.4 Monetizare și ledger
- Deblocarea = `spendSwyp` (user → pool `rewards`), o singură tranzacție, `refId` unic ⇒ dublu-click sau retry nu debitează de două ori.
- Sezonul: un singur rând `movie_unlocks` cu `episode_id NULL`; `canPlay` îl verifică.
- Nicio recompensă „SWYP pentru vizionare" în MVP: `watch_ms` anonim e exact vectorul de fraudă semnalat în auditul B-02.

### 4.5 Moderare, siguranță, conformitate
- Episoadele intră în `videos` cu `moderation_status='pending_review'`; publicarea serialului cere toate episoadele `approved`.
- `is_adult` pe serial ⇒ ascuns pentru useri neverificați (același filtru ca feed-ul).
- Drepturi de difuzare: câmp `license_note` pe serial în admin (obligatoriu la publicare), ca să nu publicăm conținut fără licență.

### 4.6 Feature flag și rollout
- `FEATURE_MOVIES` / `NEXT_PUBLIC_FEATURE_MOVIES` (OFF): rutele răspund 410, paginile 404, intrările din meniu lipsesc — același tipar ca `squadBuy`.
- Se pornește când există cel puțin un serial publicat.

## 5. Faze

1. **MVP (această iterație):** migrare, `lib/movies/{access,pricing}.ts` (pure, testate), API-urile din 4.2, admin CRUD, `/movies`, `/movies/[slug]`, player, deblocare SWYP, progres, i18n, flag.
2. **Creatori:** rol „Studio", upload de episoade din `/creator/movies`, split de venit prin `commissions`.
3. **Movies Pass (Stripe)**, notificări „episod nou", descărcare offline, recomandări.

## 6. Testare
- Unit: `canPlay`, calcul preț sezon, idempotența deblocării (mock DB ca în `squad-buy.test.ts`).
- API: 402 pe episod blocat, 200 după unlock, URL presemnat expiră, progresul se scrie o singură dată per episod.
- E2E (Playwright): catalog → serial → ep. 1 gratuit → paywall la ep. 4 → deblocare cu SWYP → redare.

## 7. Riscuri
- **Licențe de conținut** — cel mai mare risc, non-tehnic. Fără seriale licențiate, verticalul e gol.
- **Costuri de stocare/CDN** — 40 de episoade × 3 min × HLS per serial; R2 nu taxează egress, dar transcodarea rulează pe worker-ul existent (capacitate de verificat).
- **Paywall real** cere URL-uri presemnate; dacă răspunsul la Q6 e „doar UI", oricine cu URL-ul vede episodul.

## 8. Ce urmează
După ce răspunzi la Q1–Q6 (sau confirmi recomandările), scriu planul de implementare (writing-plans) și construiesc MVP-ul pe branch-ul `feat/movies`, cu TDD pe `lib/movies/*` și gate-urile obișnuite (tsc, vitest, lint, build).
