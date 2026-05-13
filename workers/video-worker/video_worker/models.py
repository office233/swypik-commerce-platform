from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Mapping


class InvalidJobPayload(ValueError):
    pass


@dataclass(frozen=True)
class VideoJob:
    job_id: str
    asset_id: str
    source_key: str
    output_prefix: str
    job_type: str = "process_video"
    video_id: str | None = None
    bucket: str | None = None
    source_bucket: str | None = None
    output_bucket: str | None = None
    thumbnail_key: str | None = None
    preview_key: str | None = None
    hls_master_key: str | None = None
    source_url: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: bytes | str | Mapping[str, Any]) -> "VideoJob":
        data = _decode_payload(payload)
        job_id = _first(data, "job_id", "jobId", "id")
        job_type = _first(data, "job_type", "jobType", "type", "kind")
        video_id = _first(data, "video_id", "videoId")
        asset_id = _first(data, "asset_id", "assetId", "video_asset_id", "videoAssetId")
        source_key = _first(data, "source_key", "sourceKey", "raw_key", "input_key", "object_key")
        output_prefix = _first(data, "output_prefix", "outputPrefix", "hls_prefix", "target_prefix")
        bucket = _first(data, "bucket", "source_bucket", "sourceBucket")
        source_bucket = _first(data, "source_bucket", "sourceBucket", "input_bucket", "inputBucket")
        output_bucket = _first(data, "output_bucket", "outputBucket", "target_bucket", "targetBucket")
        thumbnail_key = _first(data, "thumbnail_key", "thumbnailKey", "poster_key", "posterKey")
        preview_key = _first(data, "preview_key", "previewKey", "mp4_key", "mp4Key")
        hls_master_key = _first(data, "hls_master_key", "hlsMasterKey", "master_key", "masterKey")
        source_url = _first(data, "source_url", "sourceUrl", "external_url", "externalUrl")
        metadata = _metadata(_first(data, "metadata", "meta"))

        # When pulling from an external URL the `source_key` is just a synthetic
        # target path inside R2 (e.g. videos/raw/<videoId>.mp4) and is allowed
        # to be derived from `output_prefix`/`asset_id` if missing.
        if not source_key and source_url:
            source_key = f"videos/raw/{video_id or asset_id}.mp4"

        missing = [
            name
            for name, value in (
                ("job_id", job_id),
                ("asset_id", asset_id),
                ("source_key", source_key),
            )
            if not value
        ]
        if missing:
            raise InvalidJobPayload(f"Video job payload is missing: {', '.join(missing)}")

        return cls(
            job_id=str(job_id),
            asset_id=str(asset_id),
            source_key=str(source_key),
            output_prefix=str(output_prefix or f"videos/{asset_id}").strip("/"),
            job_type=str(job_type or "process_video"),
            video_id=str(video_id) if video_id else None,
            bucket=str(bucket) if bucket else None,
            source_bucket=str(source_bucket) if source_bucket else None,
            output_bucket=str(output_bucket) if output_bucket else None,
            thumbnail_key=str(thumbnail_key) if thumbnail_key else None,
            preview_key=str(preview_key) if preview_key else None,
            hls_master_key=str(hls_master_key) if hls_master_key else None,
            source_url=str(source_url) if source_url else None,
            metadata=metadata,
        )


def _decode_payload(payload: bytes | str | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(payload, Mapping):
        return _normalize_mapping(payload)
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")
    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise InvalidJobPayload("Video job payload must be valid JSON") from exc
    if not isinstance(decoded, Mapping):
        raise InvalidJobPayload("Video job payload must be a JSON object")
    return _normalize_mapping(decoded)


def _first(data: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def _metadata(value: Any) -> Mapping[str, Any]:
    if value in (None, ""):
        return {}
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise InvalidJobPayload("metadata must be a JSON object") from exc
    if not isinstance(value, Mapping):
        raise InvalidJobPayload("metadata must be an object")
    return _normalize_mapping(value)


def _normalize_mapping(data: Mapping[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(key, bytes):
            key = key.decode("utf-8")
        normalized[str(key)] = _normalize_value(value)
    return normalized


def _normalize_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8")
    if isinstance(value, Mapping):
        return _normalize_mapping(value)
    return value
