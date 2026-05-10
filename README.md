# Swypik

**Social Video Commerce Platform**

Users discover and buy products through a vertical video feed. Creators upload clips and earn commissions. AI + events + ranking transform user behavior into recommendations and sales.

## Stack

- **Frontend:** Next.js 14, React, Tailwind CSS, PWA
- **Backend:** Go modular monolith (platform-api)
- **Workers:** Python (video processing, AI)
- **Database:** PostgreSQL 16 (transactional)
- **Streams:** Redis Streams (events, jobs, cache)
- **Analytics:** ClickHouse (clickstream, ranking)
- **Storage:** Cloudflare R2 / MinIO (videos, images)
- **Payments:** Stripe Checkout

## Local Development

```bash
# PostgreSQL
DATABASE_URL=postgresql://postgres@localhost:5432/swypik

# Next.js frontend
cd . && npm run dev          # localhost:3001

# Go API
cd services/platform-api && go run ./cmd/api   # localhost:8080
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full platform blueprint.

## License

Proprietary — © 2026 Swypik
