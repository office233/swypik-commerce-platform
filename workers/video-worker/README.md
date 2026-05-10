# Aicevrei Video Worker

Python worker scaffold for Redis Streams-driven video processing jobs.

The worker:

- consumes JSON or field-based jobs from Redis Streams consumer groups;
- downloads a raw video from R2/S3-compatible object storage;
- uses `ffmpeg` to generate HLS variants and `thumbnail.jpg`;
- uploads the generated files back to object storage;
- updates Postgres job and video asset status when `DATABASE_URL` is configured;
- exposes status and AI/moderation/tagging hooks for future pipeline extensions.

## Job Payload

Add stream entries to `VIDEO_QUEUE_NAME`:

```powershell
redis-cli XADD video:jobs * job_id job_123 asset_id asset_456 source_key uploads/raw/product.mp4 output_prefix videos/asset_456 source_bucket raw-videos output_bucket processed-videos
```

The worker also accepts a single `payload` field containing JSON:

```json
{
  "job_id": "job_123",
  "asset_id": "asset_456",
  "source_key": "uploads/raw/product.mp4",
  "output_prefix": "videos/asset_456",
  "source_bucket": "aicevrei-raw-videos",
  "output_bucket": "aicevrei-processed-videos",
  "metadata": {
    "language": "ro"
  }
}
```

`bucket` is still accepted as a backwards-compatible shorthand for both source and output buckets. `source_bucket` defaults to `S3_BUCKET`; `output_bucket` defaults to `VIDEO_OUTPUT_BUCKET` and then `S3_BUCKET`. `output_prefix` is optional and defaults to `videos/<asset_id>`.

## Local Setup

```powershell
cd D:\Aicevrei\workers\video-worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
python -m video_worker.main --once
```

Install `ffmpeg` separately and ensure `ffmpeg` is on `PATH`. If Redis, Postgres, boto3, or ffmpeg are missing, the worker exits or marks jobs failed with explicit error messages rather than crashing silently.

For a local one-off job:

```powershell
python -m video_worker.main --job-json '{"job_id":"local","asset_id":"asset_local","source_key":"uploads/raw/input.mp4","output_prefix":"videos/asset_local"}'
```

## Configuration

Use `.env.example` as the starting point. Important variables:

- `REDIS_URL`: Redis connection string for job polling.
- `VIDEO_QUEUE_BACKEND`: `stream` by default; set `list` for legacy `BLPOP` behavior.
- `VIDEO_QUEUE_NAME`: stream or queue key, default `video:jobs`.
- `VIDEO_CONSUMER_GROUP`: Redis Streams consumer group, default `video-workers`.
- `VIDEO_CONSUMER_NAME`: consumer name, default host name.
- `VIDEO_FAILED_STREAM`: optional stream where failed message metadata is copied.
- `VIDEO_ACK_FAILED_JOBS`: set true to acknowledge failed stream jobs after writing `VIDEO_FAILED_STREAM`.
- `DATABASE_URL`: optional Postgres URL. If unset, status updates are skipped.
- `S3_BUCKET`, `VIDEO_OUTPUT_BUCKET`, `S3_ENDPOINT_URL`, `S3_PUBLIC_BASE_URL`: R2/S3 settings.
- `VIDEO_VARIANTS`: comma-separated `name:widthxheight:bitrate`, for example `360p:640x360:800k,720p:1280x720:2500k`.
- `VIDEO_WORK_DIR`: optional scratch directory.

## Tests

```powershell
cd D:\Aicevrei\workers\video-worker
python -m pytest
```
