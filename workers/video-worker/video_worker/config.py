from __future__ import annotations

import os
import socket
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class Variant:
    name: str
    width: int
    height: int
    bitrate: str


DEFAULT_VARIANTS = (
    Variant(name="360p", width=640, height=360, bitrate="800k"),
    Variant(name="720p", width=1280, height=720, bitrate="2500k"),
)


@dataclass(frozen=True)
class Settings:
    redis_url: str | None
    database_url: str | None
    queue_name: str
    bucket: str
    s3_endpoint_url: str | None
    s3_region: str
    public_base_url: str | None
    jobs_table: str
    assets_table: str
    variants: list[Variant]
    poll_timeout_seconds: int
    work_dir: Path
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    queue_backend: str = "stream"
    consumer_group: str = "video-workers"
    consumer_name: str = "video-worker"
    output_bucket: str | None = None
    failed_stream: str | None = None
    ack_failed_jobs: bool = False

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        values = dict(os.environ if env is None else env)
        public_base_url = _optional(values, "S3_PUBLIC_BASE_URL", "S3_PUBLIC_URL", "R2_PUBLIC_BASE_URL", "R2_PUBLIC_URL")
        if public_base_url:
            public_base_url = public_base_url.rstrip("/")

        return cls(
            redis_url=_optional(values, "REDIS_URL", "VIDEO_REDIS_URL"),
            database_url=_optional(values, "DATABASE_URL", "POSTGRES_URL"),
            queue_backend=values.get("VIDEO_QUEUE_BACKEND", "stream").strip().lower(),
            queue_name=values.get("VIDEO_QUEUE_NAME", values.get("VIDEO_QUEUE", "video:jobs")),
            consumer_group=values.get("VIDEO_CONSUMER_GROUP", "video-workers"),
            consumer_name=values.get("VIDEO_CONSUMER_NAME", socket.gethostname() or "video-worker"),
            bucket=values.get("S3_MEDIA_BUCKET", values.get("S3_BUCKET", values.get("R2_BUCKET", "video"))),
            output_bucket=_optional(values, "VIDEO_OUTPUT_BUCKET", "S3_OUTPUT_BUCKET", "R2_OUTPUT_BUCKET"),
            s3_endpoint_url=_optional(values, "S3_ENDPOINT_URL", "S3_ENDPOINT", "R2_ENDPOINT_URL", "R2_ENDPOINT"),
            s3_region=values.get("AWS_REGION", values.get("S3_REGION", values.get("R2_REGION", "auto"))),
            public_base_url=public_base_url,
            jobs_table=values.get("VIDEO_JOBS_TABLE", "video_processing_jobs"),
            assets_table=values.get("VIDEO_ASSETS_TABLE", "video_assets"),
            variants=parse_variants(values.get("VIDEO_VARIANTS")),
            poll_timeout_seconds=int(values.get("VIDEO_POLL_TIMEOUT_SECONDS", "5")),
            work_dir=Path(values.get("VIDEO_WORK_DIR", tempfile.gettempdir())) / "Swypik-video-worker",
            aws_access_key_id=_optional(values, "AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", "S3_ACCESS_KEY", "R2_ACCESS_KEY_ID"),
            aws_secret_access_key=_optional(values, "AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY", "S3_SECRET_KEY", "R2_SECRET_ACCESS_KEY"),
            failed_stream=_optional(values, "VIDEO_FAILED_STREAM"),
            ack_failed_jobs=_bool(values.get("VIDEO_ACK_FAILED_JOBS")),
        )


def parse_variants(value: str | None) -> list[Variant]:
    if not value:
        return list(DEFAULT_VARIANTS)

    variants: list[Variant] = []
    for raw_part in value.split(","):
        part = raw_part.strip()
        if not part:
            continue
        try:
            name, dimensions, bitrate = part.split(":", 2)
            width, height = dimensions.lower().split("x", 1)
            variants.append(Variant(name=name, width=int(width), height=int(height), bitrate=bitrate))
        except ValueError as exc:
            raise ValueError(
                "VIDEO_VARIANTS entries must look like '360p:640x360:800k'"
            ) from exc

    if not variants:
        raise ValueError("VIDEO_VARIANTS must define at least one variant")
    return variants


def _optional(values: Mapping[str, str], *keys: str) -> str | None:
    for key in keys:
        value = values.get(key)
        if value:
            return value
    return None


def _bool(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}
