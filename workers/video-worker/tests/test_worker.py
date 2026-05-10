from pathlib import Path

from video_worker.config import Settings, Variant
from video_worker.models import VideoJob
from video_worker.worker import VideoProcessor


class FakeStorage:
    def __init__(self):
        self.downloads = []
        self.uploads = []

    def download(self, bucket, key, destination):
        self.downloads.append((bucket, key, destination))
        Path(destination).write_bytes(b"raw video")

    def upload_directory(self, directory, bucket, prefix):
        self.uploads.append((directory, bucket, prefix))
        return {
            "master_url": f"https://cdn.example.test/{prefix}/master.m3u8",
            "thumbnail_url": f"https://cdn.example.test/{prefix}/thumbnail.jpg",
            "uploaded_keys": [f"{prefix}/master.m3u8", f"{prefix}/thumbnail.jpg"],
        }


class FakeTranscoder:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def transcode(self, source_path, output_dir, variants):
        self.calls.append((source_path, output_dir, variants))
        if self.error:
            raise self.error
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "master.m3u8").write_text("#EXTM3U\n", encoding="utf-8")
        (output_dir / "thumbnail.jpg").write_bytes(b"jpg")
        return object()


class FakeRepository:
    def __init__(self):
        self.events = []
        self.ready_results = []

    def mark_processing(self, job):
        self.events.append(("processing", job.job_id, job.asset_id))

    def mark_ready(self, job, result):
        self.ready_results.append(result)
        self.events.append(("ready", job.job_id, result["master_url"], result["thumbnail_url"]))

    def mark_failed(self, job, message):
        self.events.append(("failed", job.job_id, message))


class FakeStatusHook:
    def __init__(self):
        self.events = []

    def handle(self, event):
        self.events.append((event.status, event.job.job_id, event.message))


class FakeAnalysisHook:
    def __init__(self):
        self.before_calls = []
        self.after_calls = []

    def before_transcode(self, job, source_path):
        self.before_calls.append((job.job_id, source_path.name))

    def after_transcode(self, job, source_path, output_dir, transcode_result, upload_result):
        self.after_calls.append((job.job_id, output_dir.name, upload_result["master_url"]))
        return {"tags": ["demo"], "moderation": {"status": "queued"}}


def test_processor_downloads_transcodes_uploads_and_marks_ready(tmp_path):
    storage = FakeStorage()
    transcoder = FakeTranscoder()
    repository = FakeRepository()
    settings = Settings(
        redis_url=None,
        database_url=None,
        queue_name="queue",
        bucket="video-bucket",
        s3_endpoint_url=None,
        s3_region="auto",
        public_base_url="https://cdn.example.test",
        jobs_table="video_jobs",
        assets_table="video_assets",
        variants=[Variant(name="360p", width=640, height=360, bitrate="800k")],
        poll_timeout_seconds=5,
        work_dir=tmp_path,
    )
    job = VideoJob(
        job_id="job_1",
        asset_id="asset_1",
        source_key="raw/input.mp4",
        output_prefix="processed/asset_1",
        bucket=None,
    )

    result = VideoProcessor(settings, storage, transcoder, repository).process(job)

    assert result.ok is True
    assert storage.downloads[0][0:2] == ("video-bucket", "raw/input.mp4")
    assert transcoder.calls[0][2] == settings.variants
    assert storage.uploads[0][1:] == ("video-bucket", "processed/asset_1")
    assert repository.events == [
        ("processing", "job_1", "asset_1"),
        (
            "ready",
            "job_1",
            "https://cdn.example.test/processed/asset_1/master.m3u8",
            "https://cdn.example.test/processed/asset_1/thumbnail.jpg",
        ),
    ]


def test_processor_marks_failed_when_transcode_fails(tmp_path):
    repository = FakeRepository()
    processor = VideoProcessor(
        Settings.from_env({"VIDEO_WORK_DIR": str(tmp_path), "S3_BUCKET": "bucket"}),
        FakeStorage(),
        FakeTranscoder(error=RuntimeError("ffmpeg failed")),
        repository,
    )

    result = processor.process(
        VideoJob(
            job_id="job_2",
            asset_id="asset_2",
            source_key="raw/input.mp4",
            output_prefix="processed/asset_2",
            bucket=None,
        )
    )

    assert result.ok is False
    assert repository.events[-1] == ("failed", "job_2", "ffmpeg failed")


def test_processor_uses_separate_source_and_output_buckets(tmp_path):
    storage = FakeStorage()
    repository = FakeRepository()
    processor = VideoProcessor(
        Settings.from_env(
            {
                "VIDEO_WORK_DIR": str(tmp_path),
                "S3_BUCKET": "default-bucket",
                "VIDEO_OUTPUT_BUCKET": "default-output-bucket",
            }
        ),
        storage,
        FakeTranscoder(),
        repository,
    )

    result = processor.process(
        VideoJob(
            job_id="job_3",
            asset_id="asset_3",
            source_key="raw/input.mp4",
            output_prefix="processed/asset_3",
            bucket=None,
            source_bucket="raw-videos",
            output_bucket="processed-videos",
        )
    )

    assert result.ok is True
    assert storage.downloads[0][0:2] == ("raw-videos", "raw/input.mp4")
    assert storage.uploads[0][1:] == ("processed-videos", "processed/asset_3")


def test_processor_emits_status_and_analysis_extension_hooks(tmp_path):
    status_hook = FakeStatusHook()
    analysis_hook = FakeAnalysisHook()
    repository = FakeRepository()
    processor = VideoProcessor(
        Settings.from_env({"VIDEO_WORK_DIR": str(tmp_path), "S3_BUCKET": "video-bucket"}),
        FakeStorage(),
        FakeTranscoder(),
        repository,
        status_hooks=[status_hook],
        analysis_hooks=[analysis_hook],
    )

    result = processor.process(
        VideoJob(
            job_id="job_4",
            asset_id="asset_4",
            source_key="raw/input.mp4",
            output_prefix="processed/asset_4",
            bucket=None,
        )
    )

    assert result.ok is True
    assert status_hook.events == [
        ("processing", "job_4", None),
        ("ready", "job_4", None),
    ]
    assert analysis_hook.before_calls == [("job_4", "input.mp4")]
    assert analysis_hook.after_calls == [
        ("job_4", "hls", "https://cdn.example.test/processed/asset_4/master.m3u8")
    ]
    assert repository.ready_results[0]["analysis"] == {
        "tags": ["demo"],
        "moderation": {"status": "queued"},
    }
