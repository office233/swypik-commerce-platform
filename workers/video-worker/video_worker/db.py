from __future__ import annotations

from typing import Any

from .config import Settings
from .models import VideoJob


class DatabaseUnavailableError(RuntimeError):
    pass


class PostgresRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def mark_processing(self, job: VideoJob) -> None:
        self._execute_job_and_asset(
            job,
            "processing",
            "UPDATE {jobs} SET status = %s, started_at = NOW(), error_message = NULL WHERE id = %s",
            "UPDATE {assets} SET status = %s, updated_at = NOW(), error_message = NULL WHERE id = %s",
            ("processing", job.job_id),
            ("processing", job.asset_id),
        )

    def mark_ready(self, job: VideoJob, result: dict[str, Any]) -> None:
        self._execute_job_and_asset(
            job,
            "ready",
            "UPDATE {jobs} SET status = %s, completed_at = NOW(), error_message = NULL WHERE id = %s",
            (
                "UPDATE {assets} SET status = %s, hls_url = %s, thumbnail_url = %s, "
                "updated_at = NOW(), error_message = NULL WHERE id = %s"
            ),
            ("ready", job.job_id),
            ("ready", result.get("master_url"), result.get("thumbnail_url"), job.asset_id),
        )

    def mark_failed(self, job: VideoJob, message: str) -> None:
        self._execute_job_and_asset(
            job,
            "failed",
            "UPDATE {jobs} SET status = %s, completed_at = NOW(), error_message = %s WHERE id = %s",
            "UPDATE {assets} SET status = %s, updated_at = NOW(), error_message = %s WHERE id = %s",
            ("failed", message, job.job_id),
            ("failed", message, job.asset_id),
        )

    def _execute_job_and_asset(
        self,
        job: VideoJob,
        status: str,
        job_sql: str,
        asset_sql: str,
        job_params: tuple[Any, ...],
        asset_params: tuple[Any, ...],
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
