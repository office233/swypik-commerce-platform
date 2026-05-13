# Swypik — Social Commerce Platform

## Descriere
Swypik este o platformă de social commerce (stil TikTok Shop) care combină video-uri scurte cu cumpărături online. Utilizatorii descoperă produse prin video-uri, creatorii câștigă comisioane, iar vânzătorii gestionează un catalog de produse importate din AliExpress.

## Tech Stack
- **Frontend:** Next.js 14 (App Router) + TypeScript + TailwindCSS
- **Backend API:** Next.js API Routes (app/api/)
- **Platform API:** Go (services/platform-api/)
- **Database:** PostgreSQL (NeonDB în dev / Docker postgres în prod)
- **Storage:** Cloudflare R2 (video + imagini)
- **Payments:** Stripe (Checkout Sessions + Webhooks)
- **Cache:** Redis (Docker)
- **AI:** Google Gemini (product descriptions, chat)
- **Deploy:** Docker Compose pe Hetzner VPS

## Structura Proiectului
\\\
/home/node/swypik/                    # ROOT PROIECT
├── app/                            # Next.js App Router
│   ├── api/                        # API Routes
│   │   ├── auth/                   # Autentificare (OTP email + sessions)
│   │   ├── products/               # CRUD produse
│   │   ├── videos/                 # Video management
│   │   ├── explore/                # Feed discovery (TikTok-style)
│   │   ├── cart/ & checkout/       # Shopping flow
│   │   ├── seller/                 # Seller portal APIs
│   │   ├── creator/                # Creator dashboard APIs
│   │   ├── admin/                  # Admin panel APIs
│   │   ├── webhooks/               # Stripe webhooks
│   │   ├── upload/                 # R2 upload (presigned URLs)
│   │   ├── rewards/                # Reward system
│   │   └── chat/                   # AI chat
│   ├── shop/                       # Shop page (filterable catalog)
│   ├── product/[slug]/             # Product detail pages
│   ├── cart/                       # Cart page
│   ├── checkout/                   # Checkout flow
│   ├── creator/                    # Creator dashboard
│   ├── seller/                     # Seller portal
│   ├── admin/                      # Admin panel
│   ├── explore/                    # Video feed (TikTok-style)
│   ├── account/                    # User account
│   └── layout.tsx                  # Root layout
├── components/                     # React components
│   ├── ProductFeed.tsx             # Video feed component
│   ├── ProductDrawer.tsx           # Product detail drawer
│   ├── CheckoutForm.tsx            # Stripe checkout
│   ├── CreatorUpload.tsx           # Video upload
│   ├── BottomNav.tsx               # Mobile navigation
│   ├── seller/                     # Seller components
│   └── social/                     # Social features
├── lib/                            # Business logic
│   ├── db.ts                       # Database connection (pg Pool)
│   ├── db/                         # Query helpers
│   ├── commerce/                   # Orders, inventory
│   ├── stripe/                     # Stripe integration
│   ├── storage/                    # R2 storage helpers
│   ├── social/                     # Social features (likes, follows)
│   ├── creator/                    # Creator logic
│   ├── seller/                     # Seller logic
│   ├── ai/                         # Gemini AI integration
│   ├── aliexpress/                 # AliExpress product import
│   ├── security/                   # Auth, rate limiting
│   └── rewards/                    # Reward/points system
├── services/
│   └── platform-api/               # Go microservice
├── db/
│   └── migrations/                 # SQL migrations
├── infra/
│   └── hetzner/                    # Production deployment
│       ├── deploy.sh               # Deploy script
│       ├── docker-compose.yml      # Production compose
│       └── .env.production         # Production env vars
├── scripts/                        # Utility scripts
├── tools/                          # Test tools
├── types/                          # TypeScript types
├── packages/
│   └── contracts/                  # Shared contracts
└── public/                         # Static assets
\\\

## Baza de Date (PostgreSQL)
### Tabele principale:
- **marketplace_products** — Catalog produse (160k+ din AliExpress)
- **product_categories** — Categorii produse
- **videos** — Video-uri uploadate de creatori (product_refs → marketplace_products)
- **users** — Utilizatori platformă
- **user_sessions** — Sesiuni autentificare (SHA-256 hashed tokens)
- **commerce_orders** — Comenzi Stripe
- **commerce_order_items** — Items per comandă
- **creator_applications** — Aplicații creator
- **seller_applications** — Aplicații seller
- **rewards_log** — Puncte de recompensă
- **collections** — Colecții de produse curate
- **video_likes / video_comments** — Social engagement

### Conectare DB:
\\\ash
docker exec -it swypik-prod-postgres-1 psql -U swypik -d swypik
\\\

## Deployment
\\\ash
cd /home/node/swypik && bash infra/hetzner/deploy.sh
\\\
Aceasta face: git pull → npm install → next build → docker compose restart

## Convenții de Cod
- TypeScript strict mode
- TailwindCSS pentru styling (dark theme, mobile-first)
- API routes: app/api/[resource]/route.ts (GET, POST, PUT, DELETE)
- Database: raw SQL cu pg Pool (nu ORM)
- Error handling: try/catch cu NextResponse.json()
- Auth: cookie-based sessions cu SHA-256 hashed tokens
- Env vars: process.env.VARIABLE_NAME (din .env.production)

## REGULI IMPORTANTE
1. **NU modifica .env.production direct** — cere confirmare înainte
2. **Testează local înainte de deploy** — rulează npm run build
3. **Nu șterge date din DB** fără backup
4. **Folosește migrații SQL** pentru schema changes (db/migrations/)
5. **Mobile-first design** — tot UI-ul e optimizat pentru mobil
6. **Dark theme** — culorile sunt în globals.css
7. **Deploy cu deploy.sh** — nu modifica docker-compose manual
8. **Comit-uri descriptive** — ce s-a schimbat și de ce

## Fluxuri Principale
### 1. Descoperire Produse
User → /explore (video feed) → swipe → vezi produs → add to cart → checkout (Stripe)

### 2. Creator Flow
Creator → upload video → tag produse → video apare în feed → câștigă comision la vânzări

### 3. Seller Flow
Seller → dashboard → import produse (AliExpress) → gestionează catalog → primește comenzi

### 4. Admin Flow
Admin → /admin → gestionează utilizatori, produse, comenzi, video-uri

## URL-uri Production
- Site: https://swypik.com
- API: https://swypik.com/api/*
