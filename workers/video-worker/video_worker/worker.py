from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

from .config import Settings
from .extensions import StatusEvent
from .models import VideoJob

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProcessResult:
    ok: bool
    message: str
    details: Mapping[str, Any] | None = None


class VideoProcessor:
    def __init__(
        self,
        settings: Settings,
        storage,
        transcoder,
        repository,
        status_hooks: Iterable[object] | None = None,
        analysis_hooks: Iterable[object] | None = None,
    ) -> None:
        self.settings = settings
        self.storage = storage
        self.transcoder = transcoder
        self.repository = repository
        self.status_hooks = list(status_hooks or [])
        self.analysis_hooks = list(analysis_hooks or [])

    def process(self, job: VideoJob) -> ProcessResult:
        source_bucket = job.source_bucket or job.bucket or self.settings.bucket
        output_bucket = job.output_bucket or job.bucket or self.settings.output_bucket or self.settings.bucket
        # ATOMIC CLAIM: refuse duplicates. If this UPDATE doesn't flip a row
        # from 'queued' the job is already taken / done — ack & skip.
        try_claim = getattr(self.repository, "try_claim", None)
        if try_claim is not None:
            try:
                claimed = try_claim(job)
            except Exception:
                logger.exception("try_claim raised for job %s; proceeding optimistically", job.job_id)
                claimed = True
            if not claimed:
                logger.info("Job %s skipped (not in 'queued' state)", job.job_id)
                return ProcessResult(ok=True, message="JOB_SKIPPED")
        try:
            self.repository.mark_processing(job)
            self._emit_status(StatusEvent(job=job, status="processing"))
            with tempfile.TemporaryDirectory(prefix=f"{job.job_id}-", dir=self._work_dir()) as temp_dir:
                temp_path = Path(temp_dir)
                source_path = temp_path / "source" / Path(job.source_key).name
                output_dir = temp_path / "hls"

                source_path.parent.mkdir(parents=True, exist_ok=True)
                # Hybrid pipeline: if the job carries an external `source_url`
                # (sursă externă) download it via HTTP and mirror the raw
                # bytes into R2 under `source_key` so we keep a canonical copy.
                if job.source_url:
                    logger.info("Job %s: pulling external source %s", job.job_id, job.source_url)
                    _download_http(job.source_url, source_path)
                    try:
                        self._upload_raw_to_storage(source_path, source_bucket, job.source_key)
                    except Exception:
                        logger.exception(
                            "Job %s: raw mirror upload failed (continuing with HLS transcode)",
                            job.job_id,
                        )
                else:
                    self.storage.download(source_bucket, job.source_key, source_path)
                self._before_transcode(job, source_path)
                transcode_result = self.transcoder.transcode(source_path, output_dir, self.settings.variants)
                upload_result = self.storage.upload_directory(output_dir, output_bucket, job.output_prefix)
                analysis = self._after_transcode(
                    job, source_path, output_dir, transcode_result, upload_result
                )
                if analysis:
                    upload_result = {**upload_result, "analysis": analysis}
                self.repository.mark_ready(job, upload_result)
                self._emit_status(StatusEvent(job=job, status="ready", result=upload_result))

            return ProcessResult(ok=True, message="processed", details=upload_result)
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            logger.exception("Video job %s failed: %s", job.job_id, message)
            try:
                self.repository.mark_failed(job, message)
                self._emit_status(StatusEvent(job=job, status="failed", message=message))
            except Exception:
                logger.exception("Could not mark video job %s as failed", job.job_id)
            return ProcessResult(ok=False, message=message)

    def _upload_raw_to_storage(self, source_path: Path, bucket: str, key: str) -> None:
        """Mirror the freshly-downloaded source into R2/S3 under `key`.
        Uses the storage backend's underlying boto3 client when available so we
        don't add a new abstraction. No-op if the storage backend lacks a client.
        """
        client = getattr(self.storage, "client", None)
        if client is None:
            return
        client.upload_file(
            str(source_path),
            bucket,
            key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

    def _work_dir(self) -> str:
        self.settings.work_dir.mkdir(parents=True, exist_ok=True)
        return str(self.settings.work_dir)

    def _emit_status(self, event: StatusEvent) -> None:
        for hook in self.status_hooks:
            handle = getattr(hook, "handle", None)
            if handle is None:
                continue
            try:
                handle(event)
            except Exception:
                logger.exception(
                    "Status hook %s failed for video job %s",
                    hook.__class__.__name__,
                    event.job.job_id,
                )

    def _before_transcode(self, job: VideoJob, source_path: Path) -> None:
        for hook in self.analysis_hooks:
            before = getattr(hook, "before_transcode", None)
            if before is not None:
                before(job, source_path)

    def _after_transcode(
        self,
        job: VideoJob,
        source_path: Path,
        output_dir: Path,
        transcode_result: object,
        upload_result: Mapping[str, Any],
    ) -> dict[str, Any]:
        analysis: dict[str, Any] = {}
        for hook in self.analysis_hooks:
            after = getattr(hook, "after_transcode", None)
            if after is None:
                continue
            hook_result = after(job, source_path, output_dir, transcode_result, upload_result)
            if hook_result:
                analysis.update(dict(hook_result))
        return analysis


def _download_http(url: str, destination: Path, timeout: int = 120) -> None:
    """Stream an http(s) URL to disk. Used by the hybrid pipeline for
    external sources (URL http(s) direct către un .mp4).

    Uses the stdlib so the worker has no extra dependency. Follows redirects.
    Raises on non-2xx responses or content < 1KB (likely an error body).

    Anti-SSRF (audit 2026-08-10): refuză scheme non-http(s), IP-uri private/
    link-local (RFC-1918, 169.254.x — metadata cloud) și loopback, atât la
    rezolvarea inițială cât și implicit prin verificarea hostului.
    """
    import urllib.request
    import urllib.error
    import ipaddress
    import socket
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise RuntimeError(f"Blocked non-http(s) source URL scheme: {parsed.scheme}")
    host = parsed.hostname or ""
    if not host:
        raise RuntimeError("Blocked source URL without host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise RuntimeError(f"Could not resolve source host {host}: {exc}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise RuntimeError(f"Blocked source URL resolving to non-public IP: {host} -> {ip}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "swypik-video-worker/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = getattr(response, "status", 200)
            if status >= 400:
                raise RuntimeError(f"HTTP {status} downloading {url}")
            with destination.open("wb") as fh:
                while True:
                    chunk = response.read(1024 * 256)
                    if not chunk:
                        break
                    fh.write(chunk)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} downloading {url}: {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not download {url}: {exc.reason}") from exc

    if destination.stat().st_size < 1024:
        raise RuntimeError(
            f"Downloaded source from {url} is suspiciously small "
            f"({destination.stat().st_size} bytes)"
        )
