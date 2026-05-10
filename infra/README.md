# Social Marketplace Infrastructure

This folder contains Kubernetes-ready scaffolding for the social marketplace data plane:

- PostgreSQL for relational marketplace state and migrations in `db/migrations`.
- Redis for feed/session queues and lightweight counters.
- OpenSearch for search and discovery indexes.
- S3-compatible object storage for video assets. Local development uses MinIO through `docker-compose.social.yml`; production should use Cloudflare R2 or another managed object store.

## Local Development

```powershell
Copy-Item .env.social.example .env.social
docker compose --env-file .env.social -f docker-compose.social.yml up -d
```

PostgreSQL loads migrations from `db/migrations` on first volume initialization. Recreate the local database volume to replay bootstrap migrations from scratch.

## Kubernetes

The manifests in `infra/kubernetes/social-stack.yaml` are intentionally portable YAML. They are suitable for local clusters and staging environments, but production should normally replace in-cluster PostgreSQL, Redis, OpenSearch, and object storage with managed services.

```powershell
kubectl apply -f infra/kubernetes/social-stack.yaml
```

Before applying, replace the sample secret values and review storage class defaults for your cluster. For Cloudflare R2, keep only app environment variables that point to R2; do not deploy the MinIO workload in production.
