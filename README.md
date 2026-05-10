# AICeVrei

AICeVrei is being migrated from a Next.js storefront into a social video marketplace for product discovery, creator commerce, and AI-assisted shopping.

## Architecture Direction

- `Next.js + TypeScript` remains the web/PWA frontend.
- `services/platform-api` is the Go modular platform backend.
- `workers/video-worker` handles FFmpeg/HLS video processing.
- `workers/ai-worker` is reserved for AI tagging, captions, and moderation hooks.
- PostgreSQL is the transactional source of truth.
- Redis Streams power queues and hot event ingestion.
- ClickHouse is the analytics store for feed and commerce events.
- Cloudflare R2 is the production media store; MinIO is used locally as an R2-compatible target.

The backend starts as a modular monolith, not separate microservices. Modules should be cleanly separable later, but deployed simply now.

## Local Commands

```bash
npm run dev:web
npm run dev:social
npm run dev:platform
npm run test:platform
npm run test:workers
```

## Migration Rule

Keep the existing Next.js routes as a compatibility layer while new `/v1/*` behavior moves into the Go platform API. New critical backend behavior should be built in Go unless it is frontend-only or AI/video-worker-specific.
