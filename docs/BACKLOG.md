# Backlog — Swypik

> Actualizat 2026-08-02 (Faza 2). Prioritizare: P0 = risc financiar/securitate, P1 = important, P2 = nice-to-have.

## Securitate (din docs/SECURITY_AUDIT.md)

- [ ] **P0 S1** — `POST /api/videos/[id]/view`: dedupe views cu fingerprint/user_id (afectează ranking + plăți creator). Repro: POST repetat prin proxy-uri.
- [ ] **P0 S2** — `POST /api/v1/events{,/batch}`: legare userId de sesiune sau anonimizare explicită; rate-limit agresiv.
- [ ] **P1 S3** — `local-orders/[id]/status`: return 401 explicit când requesterul nu e nici seller nici curier.
- [ ] **P1 S4** — `notifications/subscribe` DELETE: verificare ownership pe endpoint.
- [ ] **P1 S6** — `fly/price-check`: evaluat auth/captcha (cost API Duffel/Kiwi la scraping).
- [ ] **P2 S7–S10** — chat AI cost-control, verificare existență video/produs la event-insert, audit entropie `order_lookup_token`.
- [ ] **P2** — Zod pe `admin/fulfillment` și `v1/events`; limită lungime în `ChatPostSchema`.

## Funcțional (din AUDIT-E2E-2026-08-02)

- [ ] Battles — zero cod backend, doar UI. Decizie: implementare sau eliminare UI.
- [ ] Fluxuri parțiale de finalizat (Faza 5): Food, Stays, Go, Live, Missions, Seller.
- [ ] Rate-limit Redis global pe rutele publice de search.
- [ ] Chat live + tips în live, CDN cache headers, email la seller approve (nice-to-have din prompt).

## i18n / UI

- [ ] Explore: la like/save/follow ca nelogat, API-ul dă 401 dar UI-ul face doar revert silențios — deschide modal/redirect login (UX P1).

## Curățenie (Faza 4 — din docs/DEAD_CODE.md)

- [ ] Componente/rute neimportate (rulează `scripts/audit-dead-code.mjs`).
