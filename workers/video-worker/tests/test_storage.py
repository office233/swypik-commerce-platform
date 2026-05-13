from video_worker.config import Settings
from video_worker.storage import S3Storage


class FakeS3Client:
    def __init__(self):
        self.uploads = []

    def upload_file(self, filename, bucket, key, ExtraArgs):
        self.uploads.append((filename, bucket, key, ExtraArgs))


def test_upload_directory_uses_target_bucket_for_r2_urls_and_content_types(tmp_path):
    output_dir = tmp_path / "hls"
    (output_dir / "720p").mkdir(parents=True)
    (output_dir / "master.m3u8").write_text("#EXTM3U\n", encoding="utf-8")
    (output_dir / "720p" / "segment_00000.ts").write_bytes(b"segment")
    (output_dir / "thumbnail.jpg").write_bytes(b"jpg")
    (output_dir / "preview.mp4").write_bytes(b"mp4")

    storage = S3Storage(
        Settings.from_env(
            {
                "S3_BUCKET": "default-bucket",
                "S3_ENDPOINT_URL": "https://account.r2.cloudflarestorage.com",
            }
        )
    )
    client = FakeS3Client()
    storage._client = client

    result = storage.upload_directory(output_dir, "processed-videos", "videos/asset_1")

    assert result["master_url"] == (
        "https://account.r2.cloudflarestorage.com/processed-videos/videos/asset_1/master.m3u8"
    )
    assert result["thumbnail_url"] == (
        "https://account.r2.cloudflarestorage.com/processed-videos/videos/asset_1/thumbnail.jpg"
    )
    assert result["preview_url"] == (
        "https://account.r2.cloudflarestorage.com/processed-videos/videos/asset_1/preview.mp4"
    )
    assert ("processed-videos", "videos/asset_1/master.m3u8") in [
        (bucket, key) for _, bucket, key, _ in client.uploads
    ]
    content_types = {key: extra["ContentType"] for _, _, key, extra in client.uploads}
    assert content_types["videos/asset_1/master.m3u8"] == "application/vnd.apple.mpegurl"
    assert content_types["videos/asset_1/720p/segment_00000.ts"] == "video/mp2t"
    assert content_types["videos/asset_1/preview.mp4"] == "video/mp4"
