# Platforma pentru dezvoltatori Swypik (FRONT 4)

Aplicații terțe pentru sellerii Swypik: portal dezvoltatori, App Store public,
OAuth2 simplificat și webhooks semnate.

## Cont de dezvoltator

1. Loghează-te pe Swypik, deschide `/developers` și trimite cererea (companie + website).
2. Contul intră cu `status='pending'` — aprobarea se face din Multi-ERP
   (`/api/internal/moderation/pending?type=developer` + `.../decide` cu `type:"developer"`).
3. După aprobare poți crea aplicații.

## Scopes

| Scope | Acces |
|---|---|
| `read_products` | Citește catalogul de produse al seller-ului |
| `write_products` | Creează/modifică produse |
| `read_orders` | Citește comenzile |
| `write_orders` | Actualizează statusul comenzilor |
| `read_analytics` | Statistici și rapoarte de vânzări |

## Endpoints — portal dezvoltatori (sesiune user)

| Metodă | Endpoint | Descriere |
|---|---|---|
| POST | `/api/developers/register` | Înregistrare cont dev (`{company, website?}`) → pending |
| GET | `/api/developers/me` | Starea contului curent |
| GET | `/api/developers/apps` | Lista apps-urilor tale |
| POST | `/api/developers/apps` | Creează app — returnează `oauth_client_id` + `oauth_client_secret` **o singură dată** |
| GET | `/api/developers/apps/[id]` | Detalii app |
| PATCH | `/api/developers/apps/[id]` | Editare (name, description, icon_url, scopes, webhook_url, status draft→review) |
| POST | `/api/developers/apps/[id]/rotate-secret` | Regenerare secret (returnat o singură dată) |

Secretul NU este stocat în clar — doar `sha256(secret)` în DB. Dacă îl pierzi, regenerează-l.

## App Store public

| Metodă | Endpoint | Descriere |
|---|---|---|
| GET | `/api/apps?q=&limit=` | Lista apps published |
| GET | `/api/apps/[slug]` | Detaliu app + stare instalare pentru sellerul logat |
| GET | `/api/apps/installs` | Apps instalate de sellerul logat |
| DELETE | `/api/apps/installs?app_id=` | Dezinstalare (revocă tokenul) |

Pagini: `/apps` (listare), `/apps/[slug]` (detaliu + consent + Install).

## Flux OAuth2 (simplificat)

1. **Consent** — sellerul logat instalează app-ul din `/apps/[slug]`.
   Intern: `POST /api/apps/oauth/authorize` `{client_id, scopes:[...]}` →
   `{code, expires_in: 600}` (cod one-time, 10 minute).
   `GET /api/apps/oauth/authorize?client_id=...&scopes=a,b` returnează datele
   pentru consent screen (app + descrierea scope-urilor).
2. **Exchange** — serverul app-ului:
   `POST /api/apps/oauth/token` `{client_id, client_secret, code}` →
   `{access_token: "swk_app_...", token_type: "Bearer", scopes: [...]}`.
   Tokenul este returnat **o singură dată** (în DB doar hash).
3. **Apeluri API** — `Authorization: Bearer swk_app_...`.
   Helper server-side: `getAppContext(req)` din `lib/apps/auth.ts`
   (mapează token → `{sellerId, appId, scopes}`; verifică scope cu
   `insufficientScope(...)`).

## Webhooks

La evenimente, Swypik trimite `POST` către `webhook_url` al fiecărui app
published, instalat de sellerul respectiv, cu scope potrivit:

| Event | Scope necesar | Payload `data` |
|---|---|---|
| `order.created` | `read_orders` | `{order_id, currency, total_cents, items[]}` |
| `product.updated` | `read_products` | `{product_id, title, price_cents, stock}` |

Headers:
- `X-Swypik-Event: order.created`
- `X-Swypik-Signature: sha256=<hex>` — HMAC-SHA256 al body-ului raw.

**Verificarea semnăturii:** cheia HMAC este `sha256_hex(client_secret)`
(derivat din secretul tău; Swypik nu păstrează secretul în clar).

```js
const crypto = require("crypto");
const key = crypto.createHash("sha256").update(CLIENT_SECRET).digest("hex");
const expected = "sha256=" + crypto.createHmac("sha256", key).update(rawBody).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-swypik-signature"]));
```

Livrările (status/erori) se loghează în `app_webhook_deliveries`. Timeout 8s,
fire-and-forget (fără retry automat în v1).

## Tabele (migrarea `20260730_0003_developer_platform.sql`)

`developer_accounts`, `apps`, `app_installs`, `app_oauth_codes`,
`app_webhook_deliveries`.
