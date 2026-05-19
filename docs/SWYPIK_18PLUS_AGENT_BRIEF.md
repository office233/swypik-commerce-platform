# Swypik 18+ ("After Dark") — Build Spec for the Dedicated Agent

> **Cine eşti tu (agentul):** Inginer senior responsabil exclusiv pentru Swypik 18+. Nu lucrezi pe Swypik general (swypik.com). Lucrezi pe subdomeniul `18.swypik.com`. Foloseşti **acelaşi cont de user** ca aplicaţia principală (singura legătură), dar **tot restul (DB tables, storage, payments, moderare, feed, termeni)** este izolat. Codul Swypik general este off-limits — nu modifici nimic în `app/explore`, `app/api/v1/feed`, `app/api/products`, `app/checkout`, `lib/suppliers`, `lib/stripe`, `app/admin/marketplace`, etc.

---

## 0. Reguli legale și operaționale absolute

Aceste reguli sunt **non-negociabile**. Fiecare PR le respectă.

1. **Doar adulţi verificaţi**, viewers și creatori.
   - Viewer: age verification cu KYC provider real (Veriff / Sumsub / Ondato) — NU self-declaration „I am 18+".
   - Creator: KYC complet (legal name + DOB + ID document + address + tax ref). `adult.creator_kyc.status='approved'` obligatoriu înainte de orice publish/payout.
2. **Subject consent obligatoriu**, fiecare persoană recognoscibilă din clip:
   - PDF semnat cu legal name + DOB ≥ 18 + scope + signed_at + IP. Stored ca hash în `adult.consent_releases.signed_pdf_sha256`; PDF-ul brut în R2 cu acces doar admin.
   - DB constraint: `subject_dob <= signed_at - INTERVAL '18 years'`.
   - Subiectul poate revoca oricând → `revoked_at` setat, post-urile dependente trec automat în `removed`.
3. **Conţinut interzis** (refuz hard în moderare + cod):
   - Minori (orice context).
   - Non-consensual (revenge porn, hidden cam, leaks).
   - CSAM-adjacent (uniforme şcoală + sexual, „barely legal" framing, age regression).
   - Deepfake sexual fără model release explicit al persoanei reale.
   - Bestialitate, violenţă sexuală reală, trafic, sex work coordination.
   - Conţinut sexual fără consimţământ al subiectului (chiar și consensual între creatori — fiecare semnează).
4. **Stripe interzis** pentru orice flow 18+. Procesatori permişi: CCBill, Verotel, Segpay, Paxum. DB constraint `processor CHECK IN (ccbill,verotel,segpay,paxum,manual_test)`.
5. **Mastercard Adult Content Standards** (2021): confirmare de vârstă pentru persoanele din conţinut; mecanism rapid de takedown; review uman pe content nou; documentare consimţământ.
6. **US 18 USC §2257 / 2257A**: pentru orice persoană reală în conţinut explicit, custodian of records info trebuie disponibil; releases păstrate ≥ 7 ani după revocare/closure.
7. **EU DSA** (Digital Services Act art. 28): protecție minori, risk mitigation, transparency reports.
8. **GDPR**: dreptul la ștergere se aplică datelor personale (KYC, contact); financiar și consimţăminte rămân pentru audit (legal basis: legitimate interest + legal obligation).
9. **Romania ANPC**: termeni separaţi pentru Swypik 18+, nu se amestecă cu T&C-ul magazinului normal.
10. **Apple/Google app stores**: aplicaţia 18+ NU va fi în store. Doar web (PWA). Aplicaţia principală Swypik rămâne curată şi poate fi în store.

---

## 1. Arhitectura

```
┌─────────────────────────────────────────────────────────────┐
│  swypik.com (Swypik general — NU atingi)                    │
│  - Marketplace, social shopping, Arena, Missions, etc.      │
│  - Stripe pentru plăţi                                       │
│  - schema public.*                                            │
└──────────────────┬──────────────────────────────────────────┘
                   │  shared: doar public.users (login comun)
                   │  legătură: setări → buton „Activează 18+"
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  18.swypik.com (Swypik After Dark — domeniul tău)           │
│  - schema adult.* (DB separat logic)                         │
│  - bucket R2 separat (media-adult.swypik.com)                │
│  - CCBill/Verotel/Segpay/Paxum pentru plăţi                  │
│  - feed/catalog/moderare/payouts separate                    │
│  - termeni şi politici separate                              │
│  - access gate: lib/adult/gate.ts requireAdultAccess()       │
└─────────────────────────────────────────────────────────────┘
```

**Fluxul user:**
1. User logat pe swypik.com → intră în `/settings` → vede sectiunea „Swypik 18+ (After Dark)" cu warning + T&C separat.
2. Apasă „Activează" → redirect la `https://18.swypik.com/welcome` care detectează user-ul (cookie shared `swypik_session` pe domeniul `.swypik.com`).
3. Pe 18.swypik.com → forțat să facă age verification (KYC) înainte de orice content.
4. După approve: `adult.access_grants.viewer_verified=TRUE` → poate naviga feed-ul 18+.
5. Pentru a fi creator: separat, completează KYC creator (mai dur), aşteaptă approval admin.

---

## 2. Ce există deja (DEPLOYED pe prod)

> Sesiunea anterioară a livrat fundaţia DB + access gate + payment provider interface + 2 endpoint-uri stub. **Tu construieşti DEASUPRA**, nu reinventezi.

### DB schema `adult.*` (migrations 20260519_0005 + 0006, applied LIVE)

```
adult.access_grants          (user_id PK, viewer_verified, verification_method, region_code, blocked_reason, expires_at)
adult.age_verifications      (provider, provider_session_ref, status, result_metadata)
adult.creator_kyc            (legal_first_name, legal_last_name, date_of_birth CHECK >=18y, document_type, provider, status)
adult.consent_releases       (creator_user_id, subject_legal_name, subject_dob CHECK >=18y at signing, signed_pdf_sha256, scope, revoked_at)
adult.posts                  (creator_user_id, kind, title, preview_media_key, premium_media_key, price_minor, currency, requires_subscription, consent_release_ids[], status, moderation_*)
adult.moderation_queue       (post_id, ai_score, ai_flags jsonb, human_decision)
adult.subscriptions          (fan_user_id, creator_user_id, tier_minor, processor CHECK IN (ccbill,verotel,segpay,paxum,manual_test), processor_subscription_ref, current_period_end, status)
adult.ppv_unlocks            (fan_user_id, post_id, paid_minor, processor, processor_ref)
adult.tips                   (fan_user_id, creator_user_id, post_id, amount_minor, processor, message)
adult.transactions           (user_id, kind, amount_minor, processor, processor_ref) — append-only ledger
adult.reports                (target_type, target_id, category, description, priority, status, dmca_metadata)
adult.creator_balances       (user_id PK, available_minor, pending_minor, lifetime_minor, payout_method, hold_days=14)
adult.payout_requests        (user_id, amount_minor, method, destination_ref, status)
adult.audit_log              (actor_user_id, action, target_type, target_id, before_state, after_state, ip_address)
```

**Toate constraint-urile hard sunt deja in DB:**
- `creator_kyc_must_be_adult`: dob ≤ today − 18y
- `consent_subject_must_be_adult`: subject_dob ≤ signed_at − 18y
- `post_active_needs_consent`: status='active' AND `array_length(consent_release_ids,1) >= 1`
- `processor CHECK IN` la subscriptions/ppv_unlocks/tips/transactions — Stripe imposibil la nivel DB

### Cod existent

- `lib/adult/gate.ts` → `requireAdultAccess()` returnează `{ ok, userId, creatorApproved }` sau `{ ok: false, reason: 'unauthenticated'|'not_verified'|'expired'|'blocked', redirectTo }`. **Folosește-l peste tot în /adult/*.**
- `lib/adult/payments.ts` → interface `AdultPaymentProvider` cu `createSubscription / createPPV / createTip / verifyWebhook`. Stub `ManualTestProvider` (dev only). În prod aruncă dacă nu e wired un adapter real.
- `app/api/adult/access/route.ts` → GET status.
- `app/api/adult/access/verify/route.ts` → POST starts verification (501 până nu wired un provider real).

---

## 3. Ce trebuie să construieşti (în ordine)

### Etapa 1 — Subdomeniu separat + DNS + Caddy
1. DNS: A record `18.swypik.com` → IP Hetzner.
2. Caddy block nou (în `infra/hetzner/Caddyfile`):
   ```
   18.swypik.com {
     reverse_proxy web-next:3000
     header X-Robots-Tag "noindex, nofollow, noarchive"
     header Cache-Control "no-store, private"
     # CSP + age-gate marker
     header X-Adult-Section "true"
   }
   ```
3. În Next.js `middleware.ts` (sau hostname-aware layout): dacă `request.headers.host === '18.swypik.com'` → forțează rendering doar pentru `/adult/*`. Redirect tot ce nu e `/adult/*` la `https://swypik.com$path`.
4. Cookie `swypik_session` deja Secure + Domain="`.swypik.com`" (verifică) → login partajat automat.

### Etapa 2 — KYC provider real (alege unul)
**Recomandare: Veriff** (UE-based, are robust adult/cam-site KYC product).
Alternativ: **Sumsub** sau **Ondato**.

1. Cont business + adult-flow approved.
2. Webhook endpoint: `app/api/adult/webhooks/veriff/route.ts`
   - HMAC verification cu `VERIFF_WEBHOOK_SECRET`.
   - Pe `approved`: UPDATE `adult.age_verifications.status='approved'`, INSERT/UPDATE `adult.access_grants(user_id, viewer_verified=TRUE, verified_at=now(), verification_method='3p_provider', expires_at=now()+interval '5 years')`.
   - Pe `rejected`: UPDATE row + audit_log.
3. Implementează `app/api/adult/access/verify/route.ts` cu apel real Veriff (POST la `https://stationapi.veriff.com/v1/sessions`).
4. UI: `app/adult/verify/page.tsx` afişează SDK Veriff embedded sau redirect la hostedUrl.

### Etapa 3 — Creator KYC + onboarding
1. UI: `app/adult/creator/onboarding/page.tsx` — formular legal name, DOB, document type, address, tax ref, payout method.
2. API: `POST /api/adult/creator/kyc` — creează row în `adult.creator_kyc` cu `status='pending'`, deschide Veriff session cu document scan.
3. Admin review: `app/adult/admin/kyc/page.tsx` (admin role only) — listă pending, butoane Approve/Reject cu motivul.
4. Pe approve: scrie în `audit_log`.

### Etapa 4 — Consent releases
1. UI: `app/adult/creator/releases/page.tsx` — creator listează model releases (DOB subject, scope, upload PDF semnat).
2. PDF semnat: integrare cu **DocuSign** sau **HelloSign** sau template propriu + semnătură electronică simplă (EU eIDAS).
3. API: `POST /api/adult/creator/releases` — calculează `signed_pdf_sha256`, upload în R2 `media-adult-private/releases/<id>.pdf`, INSERT în `adult.consent_releases`.
4. Validare: rejectează dacă DOB-ul subiectului implică vârstă < 18 la `signed_at`.

### Etapa 5 — Post creation cu moderare
1. UI: `app/adult/creator/post/new/page.tsx` — upload media, alege `kind`, alege release_id(s), set price/subscription.
2. API: `POST /api/adult/posts`
   - Verifică `requireAdultAccess().creatorApproved`.
   - Verifică toate `consent_release_ids` aparţin creatorului şi nu sunt revoked.
   - INSERT în `adult.posts` cu `status='pending_moderation'`.
   - Trimite media în pipeline AI moderation (Hive, Sightengine, sau AWS Rekognition Content Moderation cu adult flags).
   - INSERT în `adult.moderation_queue` cu `ai_score` şi `ai_flags`.
   - Dacă `ai_flags.minor_detected=TRUE` sau `csam_hash_hit=TRUE` → AUTO-BLOCK + alertă admin + raport la NCMEC (US) sau INHOPE (EU) dacă suspect CSAM.
3. Human review pe primele 100 post-uri per creator (apoi sampling).
4. La approve: UPDATE `status='active'`, `published_at=now()`. Doar atunci apare în feed.

### Etapa 6 — Feed 18+
1. UI: `app/adult/feed/page.tsx` — TikTok-like, doar `status='active'`.
2. API: `GET /api/adult/feed?cursor=...` — query `adult.posts` cu `status='active'`, ordered by `published_at DESC` + recommender (later).
3. Per-post access:
   - Preview media: gated by `requireAdultAccess().ok`.
   - Premium media: gated by `EXISTS (adult.subscriptions WHERE fan_user_id=current AND creator_user_id=post.creator AND status='active' AND tier_minor>=post.subscription_tier_minor)` OR `EXISTS (adult.ppv_unlocks WHERE fan_user_id=current AND post_id=post.id)`.
4. URL-uri media R2: signed URLs cu expirare 5 minute, generate doar dacă access checks pass.

### Etapa 7 — Payments (CCBill / Verotel)
1. Cont CCBill business + sub-account pentru Swypik 18+.
2. Implementează `CCBillProvider implements AdultPaymentProvider` în `lib/adult/payments/ccbill.ts`.
3. `app/api/adult/checkout/subscription/route.ts` → creează session via CCBill DataLink → hostedUrl.
4. `app/api/adult/webhooks/ccbill/route.ts` → verifică signature, INSERT în `adult.subscriptions` + `adult.transactions`.
5. La success page: redirect la conţinut, marchează unlock.

### Etapa 8 — Tips, PPV, Fan Missions, Live
- Tips: `POST /api/adult/tips` cu CCBill one-time.
- PPV unlock: `POST /api/adult/posts/:id/unlock`.
- **Fan Missions** (engagement loop): tabela `adult.fan_missions(creator_user_id, kind 'unlock_count'|'subs_count'|'tips_total', target, reward_post_id, deadline, status)` + `adult.fan_mission_pledges`. UI: bar cu progress „Dacă atingem 100 unlocks → episodul 2 unlock pentru toţi fanii".
- **Live**: integrare Mux / Cloudflare Stream (verifică ToS pentru adult), `adult.live_sessions(creator, started_at, ended_at, status, paywall_minor)`.

### Etapa 9 — Payouts
1. Cron `app/api/adult/cron/payouts/route.ts` (zilnic): mută `pending` → `available` după `hold_days=14`.
2. `app/api/adult/creator/payout-request` → INSERT în `adult.payout_requests`.
3. Admin approves → wire transfer manual (Paxum / SEPA) → marchează `paid`.

### Etapa 10 — Reports & DMCA
1. UI: button „Raportează" pe orice post → `POST /api/adult/reports`.
2. Categories `minor|csam|non_consensual|revenge` → priority=1, escaleare automată la admin via webhook (Slack/Email).
3. DMCA: form public `/adult/dmca` cu DMCA-conformant fields (sworn statement, requester legal name, etc.) → INSERT cu `category='copyright_dmca'`.
4. SLA: P1 acted within 1 hour; P3 within 24h.

---

## 4. Stack tehnic obligatoriu

- **Framework**: Next.js 15.5 App Router (acelaşi cu Swypik general).
- **DB**: PostgreSQL 16, schema `adult.*` (deja există). NU creezi tabele în `public.*`.
- **Storage**: R2 bucket NOU `swypik-adult-media` cu CDN domain `media-adult.swypik.com`. NU folosi bucket-ul `swypik-media` al aplicaţiei normale.
- **Auth**: `getAuthUser()` din `lib/auth/getAuthUser.ts` (împărtăşit). `lib/adult/gate.ts requireAdultAccess()` pe TOT ce e /adult/*.
- **KYC**: Veriff (sau Sumsub/Ondato). NU implementa self-attestation.
- **Payments**: CCBill (primar) sau Verotel. **Niciodată Stripe** în /adult/*.
- **AI moderation**: Hive Moderation / Sightengine / AWS Rekognition pentru auto-flag.
- **Live**: Mux Video (verifică ToS) sau Cloudflare Stream.
- **Email**: dedicat sender (gen `noreply@18.swypik.com`) — NU împărtăşi cu swypik.com.

---

## 5. Cum lucrezi (workflow)

1. **Cere acces VPS** (`hetzner` SSH alias) şi credențiale R2/CCBill/Veriff de la owner.
2. **Toate migrations** în `db/migrations/20260520_NNNN_adult_*.sql`. Recordează în `schema_migrations`.
3. **NU modifica niciodată** fişiere în `app/explore/`, `app/api/v1/`, `app/api/products/`, `app/checkout/`, `lib/stripe/`, `app/admin/marketplace/`, `lib/suppliers/`, `app/api/aliexpress/`.
4. **TOT codul tău** în `app/adult/`, `app/api/adult/`, `lib/adult/`, `db/migrations/*_adult_*.sql`.
5. **Commit pattern**: `feat(adult): ...` / `fix(adult): ...`. NU commit-uri care ating cod non-adult.
6. **Test build**: `docker compose build web-next` înainte de fiecare push.
7. **Deploy**: `docker compose up -d web-next`.
8. **Audit log**: orice acțiune admin în /adult/admin/* → INSERT în `adult.audit_log`.

---

## 6. State-ul actual (live pe prod)

- Migrations 0001-0006 applied. `adult.*` schema completă, 14 tabele.
- `lib/adult/gate.ts`, `lib/adult/payments.ts` exist.
- `GET /api/adult/access` → 401 fără auth, 200 cu access state.
- `POST /api/adult/access/verify` → 503 în prod (no KYC provider wired).
- Niciun UI 18+ încă. Niciun creator. Niciun post.
- 18.swypik.com NU există încă (DNS + Caddy de creat de tine).

---

## 7. Definiția de „done" pentru MVP 18+

MVP-ul livrabil:
- [ ] DNS + Caddy pentru 18.swypik.com.
- [ ] Hostname routing: 18.swypik.com servește doar /adult/* + landing /welcome.
- [ ] Integrare Veriff funcţională end-to-end (viewer poate verifica vârsta).
- [ ] Creator KYC end-to-end + admin approval workflow.
- [ ] Consent release upload + DOB validation + R2 storage.
- [ ] Post creation cu moderare AI + human review queue.
- [ ] Feed 18+ cu preview/premium gating.
- [ ] Subscriptions via CCBill (1 tier funcţional).
- [ ] Tips funcţional.
- [ ] PPV unlock funcţional.
- [ ] Reports endpoint cu auto-escalare P1.
- [ ] Payout request workflow (admin manual approve, plată externă).
- [ ] DMCA form + workflow.
- [ ] T&C separat pe `/adult/terms` + `/adult/privacy` + `/adult/2257-statement`.
- [ ] Audit log scris la fiecare acţiune admin.
- [ ] Setting în Swypik general: `/settings` → secţiune "Swypik 18+" → button "Activează" → redirect.

---

## 8. Ce să întrebi owner-ul înainte să începi

1. Care KYC provider preferă? (Veriff / Sumsub / Ondato)
2. Are deja cont CCBill / Verotel / Segpay? Care?
3. R2 bucket nou — vrea separat sau folosim prefix `adult/` în bucket-ul existent? (recomand SEPARAT)
4. Subdomeniu `18.swypik.com` sau `afterdark.swypik.com`?
5. Limite geo (US states care interzic — Texas, Louisiana, Utah, Virginia, Mississippi)?
6. Tier prices recomandate?
7. Hold window pentru payouts (default 14 zile — OK?).
8. Cine este admin pentru moderare uman (un singur user sau echipă)?
9. Custodian of records (US 2257) — nume + adresă legală?
10. Termeni & condiţii — copywriter sau template?

---

## 9. Referințe legale (citește ÎNAINTE de cod)

- **18 U.S.C. §2257 / 2257A**: https://www.justice.gov/criminal-ceos/citizens-guide-us-federal-law-child-pornography
- **DSA art. 28** (protection of minors): https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package
- **Mastercard Adult Content Standards** (April 2021): https://www.mastercard.us/en-us/business/overview/safety-and-security/security-recommendations/specialty-merchants.html
- **Stripe Restricted Businesses**: https://stripe.com/legal/restricted-businesses (confirm că adult e BANNED → de aceea folosim CCBill)
- **NCMEC CyberTipline** (mandatory report dacă găsești CSAM): https://report.cybertip.org/

---

**Acesta este tot ce ai nevoie. Cere clarificări înainte să codezi. Nu modifica codul Swypik general. Foloseşte fundaţia deja existentă. Build incremental, etapă cu etapă.**
