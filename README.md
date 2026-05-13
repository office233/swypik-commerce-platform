# Swypik

**Social Video Commerce Platform**

Users discover and buy products through a vertical video feed. Creators upload clips and earn commissions. AI, events, and ranking turn user behavior into recommendations and sales.

## Stack

- **Frontend:** Next.js 14, React, Tailwind CSS, PWA
- **Backend:** Go modular monolith (`services/platform-api`)
- **Workers:** Python video processing and AI scaffolding
- **Database:** PostgreSQL 16
- **Streams:** Redis Streams
- **Storage:** Cloudflare R2 / MinIO
- **Analytics:** ClickHouse
- **Payments:** Stripe Checkout

## Local Development

Use the full runbook in [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md).

Quick start:

```powershell
Copy-Item .env.social.example .env.social
docker compose --env-file .env.social -f docker-compose.social.yml up -d postgres redis minio minio-init
```

Run host processes from separate PowerShell terminals after loading the shared env:

```powershell
. .\infra\local\Import-SocialEnv.ps1 .\.env.social
```

```powershell
# Go API: http://localhost:8080
cd services\platform-api
go run .\cmd\api
```

```powershell
# Next.js: http://localhost:3000
npm run dev -- -p 3000
```

```powershell
# Video worker
cd workers\video-worker
python -m video_worker.main --once
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the platform blueprint.

## License

Proprietary - (c) 2026 Swypik
