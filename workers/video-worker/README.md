# Swypik Video Worker

Python worker for Redis Streams-driven video processing jobs.

The worker:

- consumes JSON or field-based jobs from Redis Streams consumer groups;
- downloads the raw upload from R2/S3-compatible storage (or, for admin re-encodes, from an external `source_url`);
- probes it with `ffprobe` (display dimensions after rotation, duration, audio presence, codec);
- validates the (trimmed) duration against per-job or default limits;
- generates HLS renditions on a **short-side ladder** that keeps the source aspect ratio (true 9:16 for vertical clips, no padding, no upscaling), plus `preview.mp4`, `thumbnail.jpg` and, when the source has sound, `audio.m4a` (mono 16 kHz, for speech-to-text captions);
- uploads everything back to object storage;
- reports progress (`stage` + `progress`) and final status to Postgres when `DATABASE_URL` is configured;
- retries transient failures inline and records a stable `error_code` on failure;
- exposes status and AI/moderation/tagging hooks for future pipeline extensions.

## Job Payload

Add stream entries to `VIDEO_QUEUE_NAME`:

```powershell
redis-cli XADD video:jobs * job_id job_123 asset_id asset_456 source_key uploads/raw/product.mp4 output_prefix videos/asset_456 source_bucket raw-videos output_bucket processed-videos
```

The worker also accepts a single `payload` field containing JSON:

```json
{
  "job_type": "process_video",
  "job_id": "job_123",
  "video_id": "video_789",
  "asset_id": "asset_456",
  "source_key": "videos/raw/upload_1/camera.mov",
  "source_url": "",
  "output_prefix": "videos/hls/video_789",
  "source_bucket": "Swypik-raw-videos",
  "output_bucket": "Swypik-processed-videos",
  "limits": { "min_duration_ms": 1000, "max_duration_ms": 180000 },
  "trim": { "start_ms": 1500, "end_ms": 31500 },
  "thumbnail_time_ms": 2000,
  "metadata": { "language": "ro" }
}
```

- `source_url`: empty for normal creator uploads → the worker downloads `source_bucket`/`source_key` from storage. A non-empty http(s) URL (admin re-encode) is downloaded with SSRF protection and mirrored raw into storage under `source_key` (content type guessed from the file name).
- `limits` (optional): per-job duration limits; missing fields fall back to `VIDEO_MIN_DURATION_MS` / `VIDEO_MAX_DURATION_MS`. The max has a 500 ms tolerance.
- `trim` (optional): `start_ms` / `end_ms` in the source timeline. Applied to every output (`-ss` before `-i`, `-t` = effective duration). Limits are checked on the trimmed duration.
- `thumbnail_time_ms` (optional): poster time relative to the trimmed clip start; default `min(1000, duration/2)`.
- Invalid numbers in these optional fields are ignored (treated as absent).

`bucket` is still accepted as a shorthand for both buckets. `source_bucket` defaults to `S3_BUCKET`; `output_bucket` defaults to `VIDEO_OUTPUT_BUCKET` and then `S3_BUCKET`. `output_prefix` defaults to `videos/<asset_id>`. `thumbnail_key`, `preview_key` and `hls_master_key` are accepted for producer/DB compatibility.

## Renditions

`VIDEO_LADDER` (default `360:800k,540:1400k,720:2800k,1080:5000k`) lists `short_side:bitrate` rungs. Every rung whose short side is ≤ the source short side is produced; the long side keeps the source aspect ratio (rounded to an even number). A 1080x1920 upload yields 360x640, 540x960, 720x1280 and 1080x1920; a 1920x1080 upload yields the landscape equivalents; a 3:4 clip stays 3:4. A source smaller than the lowest rung gets a single rendition at its own (even) size. `VIDEO_VARIANTS` has been **removed**.

## Result, Progress, Retries

`video_processing_jobs.stage` goes `downloading` (5) → `probing` (12) → `transcoding` (15..85) → `uploading` (90) → `done` (100); `retrying` between attempts. Progress writes are best-effort.

On success the job `result` (and the `videos` row) gets `master_url`, `thumbnail_url`, `preview_url`, `audio_url` (or `null`), `duration_ms` (trimmed), `width`/`height` (source display size), `has_audio`, `orientation` (`vertical` / `landscape` / `square`) and `renditions`. A thumbnail chosen by the creator (`videos.metadata.cover_source = 'custom'`) is not overwritten.

Transient errors (storage/network) are retried inline up to `VIDEO_MAX_ATTEMPTS` total attempts with backoff `VIDEO_RETRY_BACKOFF_SECONDS * 2^(attempt-1)`. Permanent errors fail immediately. Error codes:

| code | retried | cause |
|---|---|---|
| `no_video_stream` | no | the file has no video track |
| `invalid_source` | no | unreadable file, missing duration or dimensions |
| `duration_too_short` / `duration_too_long` | no | trimmed duration outside limits |
| `transcode_failed` | no | ffmpeg exited with an error |
| `timeout` | no | ffmpeg exceeded `FFMPEG_TIMEOUT_SECONDS` |
| `worker_misconfigured` | no | ffmpeg/ffprobe/boto3/psycopg missing |
| `storage_error` | yes | S3/R2 or network failure |
| `internal_error` | yes | anything else |

A failed video is set to `status='failed'`; visibility is left to the DB trigger `enforce_video_public_safety`, so the creator can retry.

## Local Setup

```powershell
cd E:\Swypik\swypik\app\workers\video-worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
python -m video_worker.main --once
```

Install `ffmpeg` (which ships `ffprobe`) separately and ensure both are on `PATH`.

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
- `VIDEO_LADDER`: rendition ladder, `short_side:bitrate` comma-separated.
- `VIDEO_ENCODER`: `libx264` (default, CPU) or `h264_nvenc` (NVIDIA GPU). Any other value stops the worker at startup. NVENC needs an NVIDIA GPU, an ffmpeg built with `--enable-nvenc`, and GPU access in the container (NVIDIA Container Toolkit).
- `VIDEO_MIN_DURATION_MS` (default `1000`), `VIDEO_MAX_DURATION_MS` (default `180000`): default duration limits.
- `VIDEO_MAX_ATTEMPTS` (default `3`), `VIDEO_RETRY_BACKOFF_SECONDS` (default `5`): inline retries.
- `FFMPEG_TIMEOUT_SECONDS` (default `900`): per-command ffmpeg budget.
- `VIDEO_WORK_DIR`: optional scratch directory.

## Tests

```powershell
cd E:\Swypik\swypik\app\workers\video-worker
python -m pytest
```

Tests use injected runners and fakes; ffmpeg, S3, Redis and Postgres are not needed.
