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
        try:
            self.repository.mark_processing(job)
            self._emit_status(StatusEvent(job=job, status="processing"))
            with tempfile.TemporaryDirectory(prefix=f"{job.job_id}-", dir=self._work_dir()) as temp_dir:
                temp_path = Path(temp_dir)
                source_path = temp_path / "source" / Path(job.source_key).name
                output_dir = temp_path / "hls"

                source_path.parent.mkdir(parents=True, exist_ok=True)
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
