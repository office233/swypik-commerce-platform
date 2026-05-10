# Swypik — Social Video Commerce Platform

## What is Swypik

Swypik is a video-first social commerce platform.

Users don't just search for products. They enter a vertical video feed — like TikTok — where every video can have:
- Attached product(s)
- Creator attribution
- Comments, likes, saves, shares
- Cart button + instant checkout
- AI-powered recommendations
- Personalized ranking based on behavior

## Core Loops

### User Loop
```
Open app → Video feed → Watch clips → Interact (like/save/comment/share)
→ Tap product → Add to cart → Checkout → Behavior data improves feed
```

### Creator Loop
```
Sign up → Upload video → Attach product(s) → Publish
→ Get views/clicks/sales → Earn commission → Optimize next clips
```

### Marketplace Loop
```
Products imported/managed → Creators promote via video
→ Feed distributes best clips → Users buy
→ Platform takes fee → Creators earn commission
```

## Architecture Principle

**Build big, deploy simple.**

- Serious architecture, modular code
- Simple deployment
- No premature microservices
- No Kubernetes initially
- Go modular monolith for v1

## Repository Structure

```
swypik/
  apps/
    web/                          # Next.js frontend (Phase 2 migration)
  
  services/
    platform-api/                 # Go modular monolith
      cmd/api/
      internal/
        auth/                     # JWT, sessions, roles
        users/                    # User profiles, settings
        creators/                 # Creator profiles, verification
        videos/                   # Upload, processing, publish
        feed/                     # Ranking, candidates, exploration
        events/                   # Batch ingestion, Redis Streams
        social/                   # Likes, follows, saves, shares
        marketplace/              # Products, inventory, collections
        checkout/                 # Cart, Stripe, orders, commissions
        notifications/            # Push, email, in-app
        moderation/               # Reports, review, strikes
        admin/                    # Dashboard, metrics, management
        platform/
          config/
          db/
          redis/
          http/
          logger/
      migrations/
      openapi/

  workers/
    video-worker/                 # Python: FFmpeg, HLS, thumbnails
    ai-worker/                    # Python: Tags, captions, moderation

  packages/
    contracts/                    # OpenAPI specs

  infra/
    docker/
    clickhouse/
    redis/
    postgres/
    minio/
    observability/

  docs/
    ARCHITECTURE.md
    LOCAL_DEVELOPMENT.md
    API.md
    VIDEO_PIPELINE.md
```

## Tech Stack

### Local Development
```
Host:
├── Next.js              localhost:3001
├── Go API               localhost:8080
└── Python workers       local process or Docker

Docker:
├── PostgreSQL           localhost:5432
├── Redis                localhost:6379
├── ClickHouse           localhost:8123
├── MinIO                localhost:9000
└── MinIO Console        localhost:9001
```

### Production (Hetzner)
```
Hetzner CX32:
├── Next.js + Go API + Workers
├── PostgreSQL + Redis + ClickHouse
└── Cloudflare Tunnel (zero exposed ports)

Cloudflare:
├── DNS + CDN + SSL + DDoS
└── R2 (video/image storage)
```

## Data Architecture

| Store | Purpose |
|-------|---------|
| **PostgreSQL** | Source of truth: users, videos, products, orders, social graph |
| **Redis Streams** | Event queues, video jobs, notifications, cache, rate limits |
| **ClickHouse** | Analytics: clickstream, watch time, CTR, conversion, ranking data |
| **R2/MinIO** | Media: source videos, HLS segments, thumbnails, captions |

## API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/feed` | GET | Video feed with ranking |
| `/v1/events/batch` | POST | Batch event ingestion |
| `/v1/videos/uploads/init` | POST | Start upload session |
| `/v1/videos/uploads/complete` | POST | Complete upload |
| `/v1/videos/:id/publish` | POST | Publish video to feed |
| `/v1/social/follow` | POST | Follow creator |
| `/v1/social/unfollow` | POST | Unfollow creator |
| `/v1/videos/:id/like` | POST | Like video |
| `/v1/videos/:id/save` | POST | Save video |
| `/v1/videos/:id/comments` | GET/POST | Comments |
| `/v1/cart/items` | POST/DELETE | Cart management |
| `/v1/checkout` | POST | Create checkout session |
| `/v1/payments/webhooks/stripe` | POST | Stripe webhooks |
| `/v1/admin/*` | GET/POST | Admin dashboard APIs |

## Feed Ranking v1

```
score =
  0.25 × completion_rate
+ 0.20 × watch_time_score  
+ 0.15 × product_click_rate
+ 0.15 × add_to_cart_rate
+ 0.10 × purchase_rate
+ 0.05 × save_share_rate
+ 0.05 × freshness
+ 0.05 × creator_quality
- report_penalty
- not_interested_penalty
- low_inventory_penalty
```

Feed mix: **80% exploitation, 20% exploration**

## Video Pipeline

```
Creator selects video → Frontend requests upload init from Go
→ Go creates draft + upload session → Returns signed URL
→ Frontend uploads directly to R2/MinIO → Calls upload complete
→ Go verifies object → Creates processing job → Redis Stream
→ Python worker: ffprobe → ffmpeg HLS → thumbnail → captions
→ Worker writes video_assets → Marks video ready
→ Creator publishes → Video enters feed
```

## Phased Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **0** | Local foundation, rebrand, DB repos | 🔄 In Progress |
| **1** | Platform API: auth, feed, events, social | ⏳ Next |
| **2** | Video pipeline: upload, MinIO, worker | ⏳ |
| **3** | Creator commerce: dashboard, commissions | ⏳ |
| **4** | Feed intelligence: ClickHouse, ranking v1.5 | ⏳ |
| **5** | Production deploy: Hetzner, Cloudflare, R2 | ⏳ |
| **6** | Scale: mobile app, advanced AI, Stripe Connect | ⏳ |
