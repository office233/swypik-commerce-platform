from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from .config import Settings
from .models import VideoJob


class DatabaseUnavailableError(RuntimeError):
    pass


class PostgresRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        # 2026-08-10 (audit P1): pool de conexiuni reutilizabile în loc de o
        # conexiune nouă per operație (fiecare job deschidea 4-5 conexiuni →
        # risc de epuizare max_connections sub burst). Pool lazy, thread-safe.
        self._pool = None
        self._pool_lock = threading.Lock()

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
            self._release(connection)

    def heartbeat(self, job: VideoJob) -> None:
        """Împinge `updated_at` cât timp jobul rulează.

        Fără asta, watchdog-ul (app/api/cron/watchdog-videos) reseta la 'queued'
        orice job 'running' cu updated_at mai vechi de STALE_RUNNING_MIN (30 min)
        și un alt worker îl relua — dublă transcodare pentru clipuri mari,
        legitime, care procesează >30 min (audit 2026-08-25). Best-effort: un
        heartbeat pierdut nu opreste procesarea.
        """
        if not self.settings.database_url:
            return
        connection = self._connect()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        _format_table(
                            "UPDATE {jobs} SET updated_at=NOW() "
                            "WHERE id=%s AND status='running'",
                            "jobs",
                            self.settings.jobs_table,
                        ),
                        (job.job_id,),
                    )
        finally:
            self._release(connection)

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

    def update_progress(self, job: VideoJob, stage: str, pct: int) -> None:
        """Etapa + procentul afișat în wizard. Best-effort (apelantul înghite erorile)."""
        self._execute_job_only(
            "UPDATE {jobs} SET stage=%s, progress=%s, updated_at=NOW() WHERE id=%s",
            (stage, max(0, min(100, int(pct))), job.job_id),
        )

    def mark_retrying(self, job: VideoJob, attempt: int, code: str, message: str) -> None:
        del attempt  # attempt_count e gestionat de try_claim
        self._execute_job_only(
            "UPDATE {jobs} SET stage='retrying', error_code=%s, error_message=%s, "
            "updated_at=NOW() WHERE id=%s",
            (code, message, job.job_id),
        )

    def mark_ready(self, job: VideoJob, result: dict[str, Any]) -> None:
        video_metadata = {
            "preview_url": result.get("preview_url"),
            "audio_url": result.get("audio_url"),
            "has_audio": result.get("has_audio"),
            "orientation": result.get("orientation"),
            "renditions": result.get("renditions"),
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
        self._execute_job_and_asset(
            job,
            "succeeded",
            (
                "UPDATE {jobs} SET status = %s, stage = 'done', progress = 100, completed_at = NOW(), "
                "error_message = NULL, error_code = NULL, result = %s, updated_at = NOW() WHERE id = %s"
            ),
            (
                "UPDATE {assets} SET status = %s, public_url = %s, metadata = metadata || %s::jsonb, "
                "updated_at = NOW() WHERE id = %s"
            ),
            ("succeeded", _json(result), job.job_id),
            ("available", result.get("master_url"), _json(result), job.asset_id),
            (
                "UPDATE videos SET status = %s, playback_url = %s, "
                # Coperta aleasă explicit de creator nu e suprascrisă de cadrul extras.
                "thumbnail_url = CASE WHEN COALESCE(metadata->>'cover_source','') = 'custom' "
                "THEN thumbnail_url ELSE %s END, "
                "duration_ms = %s, width = %s, height = %s, "
                "metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb, updated_at = NOW() "
                "WHERE id = %s"
            ),
            (
                "ready",
                result.get("master_url"),
                result.get("thumbnail_url"),
                result.get("duration_ms"),
                result.get("width"),
                result.get("height"),
                _json(video_metadata),
                job.video_id,
            )
            if job.video_id
            else None,
        )

    def mark_failed(self, job: VideoJob, message: str, error_code: str = "internal_error") -> None:
        error = {"error_message": message, "error_code": error_code}
        self._execute_job_and_asset(
            job,
            "failed",
            (
                "UPDATE {jobs} SET status = %s, completed_at = NOW(), error_message = %s, "
                "error_code = %s, updated_at = NOW() WHERE id = %s"
            ),
            "UPDATE {assets} SET status = %s, updated_at = NOW(), metadata = metadata || %s::jsonb WHERE id = %s",
            ("failed", message, error_code, job.job_id),
            ("failed", _json(error), job.asset_id),
            # visibility/is_hidden NU se mai ating: triggerul enforce_video_public_safety
            # privatizează clipurile publice eșuate, iar creatorul trebuie să poată reîncerca.
            (
                "UPDATE videos SET status = %s, metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb, "
                "updated_at = NOW() WHERE id = %s"
            ),
            ("failed", _json(error), job.video_id) if job.video_id else None,
        )

    def _execute_job_only(self, sql: str, params: tuple[Any, ...]) -> None:
        if not self.settings.database_url:
            return
        connection = self._connect()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(_format_table(sql, "jobs", self.settings.jobs_table), params)
        finally:
            self._release(connection)

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
            self._release(connection)

    def _connect(self):
        try:
            import psycopg
        except ImportError as exc:
            raise DatabaseUnavailableError(
                "psycopg is not installed; install requirements.txt to enable Postgres updates"
            ) from exc
        # Pool lazy (psycopg_pool) cu fallback la conexiune directă dacă pool-ul
        # nu e disponibil. getconn/putconn e gestionat de _borrow().
        if self._pool is None:
            with self._pool_lock:
                if self._pool is None:
                    try:
                        from psycopg_pool import ConnectionPool
                        self._pool = ConnectionPool(
                            self.settings.database_url,
                            min_size=1,
                            max_size=4,
                            open=True,
                            timeout=10,
                        )
                    except ImportError:
                        self._pool = False  # marcaj: pool indisponibil → conexiuni directe
        if self._pool:
            return self._pool.getconn()
        return psycopg.connect(self.settings.database_url)

    def _release(self, connection) -> None:
        """Întoarce conexiunea în pool (dacă există) sau o închide."""
        if self._pool:
            try:
                self._pool.putconn(connection)
                return
            except Exception:
                pass
        try:
            connection.close()
        except Exception:
            pass


def _format_table(sql: str, placeholder: str, table_name: str) -> str:
    if not table_name.replace("_", "").isalnum():
        raise ValueError(f"Unsafe table name: {table_name}")
    return sql.replace(f"{{{placeholder}}}", table_name)


def _json(value: Any) -> str:
    import json

    return json.dumps(value)
