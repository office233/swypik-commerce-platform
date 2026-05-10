from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .config import Settings
from .models import VideoJob


class QueueUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class QueuedVideoJob:
    job: VideoJob
    message_id: str | None = None
    stream: str | None = None
    raw_payload: Mapping[str, Any] | bytes | str | None = None


class RedisQueue:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = None
        self._stream_group_ready = False

    @property
    def client(self):
        if self._client is None:
            if not self.settings.redis_url:
                raise QueueUnavailableError("REDIS_URL is not configured; worker will not poll jobs")
            try:
                import redis
            except ImportError as exc:
                raise QueueUnavailableError(
                    "redis is not installed; install requirements.txt to enable Redis polling"
                ) from exc
            self._client = redis.Redis.from_url(self.settings.redis_url)
        return self._client

    def pop(self) -> VideoJob | None:
        queued = self.pop_message()
        return queued.job if queued else None

    def pop_message(self) -> QueuedVideoJob | None:
        if self.settings.queue_backend == "list":
            return self._pop_list_message()
        if self.settings.queue_backend != "stream":
            raise QueueUnavailableError(f"Unsupported VIDEO_QUEUE_BACKEND: {self.settings.queue_backend}")
        return self._pop_stream_message()

    def ack(self, queued: QueuedVideoJob) -> None:
        if not queued.message_id or not queued.stream:
            return
        self.client.xack(queued.stream, self.settings.consumer_group, queued.message_id)

    def fail(self, queued: QueuedVideoJob, message: str) -> None:
        if queued.message_id and self.settings.failed_stream:
            self.client.xadd(
                self.settings.failed_stream,
                {
                    "source_stream": queued.stream or self.settings.queue_name,
                    "source_message_id": queued.message_id,
                    "error": message,
                },
            )
        if self.settings.ack_failed_jobs:
            self.ack(queued)

    def _pop_list_message(self) -> QueuedVideoJob | None:
        item = self.client.blpop(self.settings.queue_name, timeout=self.settings.poll_timeout_seconds)
        if item is None:
            return None
        _, payload = item
        return QueuedVideoJob(job=VideoJob.from_payload(payload), raw_payload=payload)

    def _pop_stream_message(self) -> QueuedVideoJob | None:
        self._ensure_stream_group()
        messages = self.client.xreadgroup(
            groupname=self.settings.consumer_group,
            consumername=self.settings.consumer_name,
            streams={self.settings.queue_name: ">"},
            count=1,
            block=self.settings.poll_timeout_seconds * 1000,
        )
        if not messages:
            return None

        for stream, entries in messages:
            stream_name = _decode_value(stream)
            for message_id, fields in entries:
                decoded_fields = _decode_mapping(fields)
                payload = _payload_from_stream_fields(decoded_fields)
                return QueuedVideoJob(
                    job=VideoJob.from_payload(payload),
                    message_id=_decode_value(message_id),
                    stream=stream_name,
                    raw_payload=decoded_fields,
                )
        return None

    def _ensure_stream_group(self) -> None:
        if self._stream_group_ready:
            return
        try:
            self.client.xgroup_create(
                name=self.settings.queue_name,
                groupname=self.settings.consumer_group,
                id="0",
                mkstream=True,
            )
        except Exception as exc:
            if "BUSYGROUP" not in str(exc):
                raise
        self._stream_group_ready = True


def _payload_from_stream_fields(fields: Mapping[str, Any]) -> Mapping[str, Any] | str | bytes:
    payload = fields.get("payload")
    if payload is not None and len(fields) == 1:
        return payload
    return fields


def _decode_mapping(fields: Mapping[Any, Any]) -> dict[str, Any]:
    return {str(_decode_value(key)): _decode_value(value) for key, value in fields.items()}


def _decode_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return value
