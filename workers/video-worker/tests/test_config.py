from video_worker.config import Settings, Variant


def test_settings_loads_local_safe_defaults(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)

    settings = Settings.from_env({})

    assert settings.redis_url is None
    assert settings.database_url is None
    assert settings.queue_name == "video:jobs"
    assert settings.s3_endpoint_url is None
    assert settings.variants == [
        Variant(name="360p", width=640, height=360, bitrate="800k"),
        Variant(name="720p", width=1280, height=720, bitrate="2500k"),
    ]


def test_settings_parses_variants_and_table_names():
    settings = Settings.from_env(
        {
            "VIDEO_VARIANTS": "240p:426x240:450k,1080p:1920x1080:5000k",
            "VIDEO_JOBS_TABLE": "jobs_table",
            "VIDEO_ASSETS_TABLE": "assets_table",
            "S3_PUBLIC_BASE_URL": "https://cdn.example.test/media/",
        }
    )

    assert settings.variants == [
        Variant(name="240p", width=426, height=240, bitrate="450k"),
        Variant(name="1080p", width=1920, height=1080, bitrate="5000k"),
    ]
    assert settings.jobs_table == "jobs_table"
    assert settings.assets_table == "assets_table"
    assert settings.public_base_url == "https://cdn.example.test/media"


def test_settings_loads_redis_stream_and_output_bucket_settings():
    settings = Settings.from_env(
        {
            "REDIS_URL": "redis://localhost:6379/0",
            "VIDEO_QUEUE_BACKEND": "stream",
            "VIDEO_QUEUE_NAME": "video:stream",
            "VIDEO_CONSUMER_GROUP": "video-workers",
            "VIDEO_CONSUMER_NAME": "worker-a",
            "VIDEO_OUTPUT_BUCKET": "processed-videos",
        }
    )

    assert settings.queue_backend == "stream"
    assert settings.queue_name == "video:stream"
    assert settings.consumer_group == "video-workers"
    assert settings.consumer_name == "worker-a"
    assert settings.output_bucket == "processed-videos"
