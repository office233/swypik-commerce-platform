from __future__ import annotations

from typing import Any

from .config import Settings
from .models import VideoJob


class DatabaseUnavailableError(RuntimeError):
    pass


class PostgresRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def try_claim(self, job: VideoJob) -> bool:
        """Atomically claim a job: flip status queued->running only if still queued.

        Returns True if THIS worker won the claim (proceed to process), False if
        another worker / a watchdog requeue / a manual flip already moved the job
        out of 'queued'. The False path lets main.py ack the redis message and
        skip processing, eliminating duplicate work that was causing the
        ~150%% CPU + GB-egress runaway in 2026-05-20.
        """
        if not self.settings.database_url:
            return True
        connection = self._connect()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        _format_table(
                            "UPDATE {jobs} SET status='running', started_at=NOW(), "
                            "attempt_count=COALESCE(attempt_count,0)+1, error_message=NULL "
                            "WHERE id=%s AND status='queued' RETURNING id",
                            "jobs",
                            self.settings.jobs_table,
                        ),
                        (job.job_id,),
                    )
                    return cursor.fetchone() is not None
        finally:
            connection.close()

    def mark_processing(self, job: VideoJob) -> None:
        self._execute_job_and_asset(
            job,
            "running",
            "UPDATE {jobs} SET status = %s, started_at = NOW(), error_message = NULL WHERE id = %s",
            "UPDATE {assets} SET status = %s, updated_at = NOW(), metadata = metadata - 'error_message' WHERE id = %s",
            ("running", job.job_id),
            ("uploading", job.asset_id),
            "UPDATE videos SET status = %s, updated_at = NOW() WHERE id = %s",
            ("processing", job.video_id) if job.video_id else None,
        )

    def mark_ready(self, job: VideoJob, result: dict[str, Any]) -> None:
        self._execute_job_and_asset(
            job,
            "succeeded",
            "UPDATE {jobs} SET status = %s, completed_at = NOW(), error_message = NULL, result = %s WHERE id = %s",
            (
                "UPDATE {assets} SET status = %s, public_url = %s, metadata = metadata || %s::jsonb, "
                "updated_at = NOW() WHERE id = %s"
            ),
            ("succeeded", _json(result), job.job_id),
            ("available", result.get("master_url"), _json(result), job.asset_id),
            (
                "UPDATE videos SET status = %s, playback_url = %s, thumbnail_url = %s, updated_at = NOW() "
                "WHERE id = %s"
            ),
            ("ready", result.get("master_url"), result.get("thumbnail_url"), job.video_id) if job.video_id else None,
        )

    def mark_failed(self, job: VideoJob, message: str) -> None:
        self._execute_job_and_asset(
            job,
            "failed",
            "UPDATE {jobs} SET status = %s, completed_at = NOW(), error_message = %s WHERE id = %s",
            "UPDATE {assets} SET status = %s, updated_at = NOW(), metadata = metadata || %s::jsonb WHERE id = %s",
            ("failed", message, job.job_id),
            ("failed", _json({"error_message": message}), job.asset_id),
            "UPDATE videos SET status = %s, metadata = metadata || %s::jsonb, updated_at = NOW() WHERE id = %s",
            ("failed", _json({"error_message": message}), job.video_id) if job.video_id else None,
        )

    def _execute_job_and_asset(
        self,
        job: VideoJob,
        status: str,
        job_sql: str,
        asset_sql: str,
        job_params: tuple[Any, ...],
        asset_params: tuple[Any, ...],
        video_sql: str | None = None,
        video_params: tuple[Any, ...] | None = None,
    ) -> None:
        del job, status
        if not self.settings.database_url:
            return

        connection = self._connect()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(_format_table(job_sql, "jobs", self.settings.jobs_table), job_params)
                    cursor.execute(
                        _format_table(asset_sql, "assets", self.settings.assets_table), asset_params
                    )
                    if video_sql and video_params:
                        cursor.execute(video_sql, video_params)
        finally:
            connection.close()

    def _connect(self):
        try:
            import psycopg
        except ImportError as exc:
            raise DatabaseUnavailableError(
                "psycopg is not installed; install requirements.txt to enable Postgres updates"
            ) from exc
        return psycopg.connect(self.settings.database_url)


def _format_table(sql: str, placeholder: str, table_name: str) -> str:
    if not table_name.replace("_", "").isalnum():
        raise ValueError(f"Unsafe table name: {table_name}")
    return sql.replace(f"{{{placeholder}}}", table_name)


def _json(value: Any) -> str:
    import json

    return json.dumps(value)
