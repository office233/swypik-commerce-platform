import json

import pytest

from video_worker.models import InvalidJobPayload, VideoJob


def test_video_job_parses_redis_json_payload():
    payload = {
        "job_id": "job_123",
        "video_id": "video_789",
        "asset_id": "asset_456",
        "source_key": "uploads/raw/product.mp4",
        "output_prefix": "videos/asset_456",
        "bucket": "raw-bucket",
    }

    job = VideoJob.from_payload(json.dumps(payload).encode("utf-8"))

    assert job.job_id == "job_123"
    assert job.video_id == "video_789"
    assert job.asset_id == "asset_456"
    assert job.source_key == "uploads/raw/product.mp4"
    assert job.output_prefix == "videos/asset_456"
    assert job.bucket == "raw-bucket"


def test_video_job_parses_separate_source_and_output_buckets_with_metadata():
    job = VideoJob.from_payload(
        {
            "jobId": "job_abc",
            "videoAssetId": "asset_xyz",
            "input_key": "uploads/raw/input.mov",
            "source_bucket": "raw-videos",
            "output_bucket": "processed-videos",
            "metadata": {"seller_id": "seller_1", "language": "ro"},
        }
    )

    assert job.job_id == "job_abc"
    assert job.asset_id == "asset_xyz"
    assert job.source_key == "uploads/raw/input.mov"
    assert job.output_prefix == "videos/asset_xyz"
    assert job.source_bucket == "raw-videos"
    assert job.output_bucket == "processed-videos"
    assert job.metadata == {"seller_id": "seller_1", "language": "ro"}


def test_video_job_accepts_process_video_payload_shape():
    job = VideoJob.from_payload(
        {
            "job_type": "process_video",
            "job_id": "job_abc",
            "video_id": "video_123",
            "asset_id": "asset_xyz",
            "source_key": "videos/raw/upload_1/camera.mov",
            "output_prefix": "videos/hls/video_123",
            "thumbnail_key": "videos/thumbnails/video_123.jpg",
            "preview_key": "videos/previews/video_123.mp4",
            "hls_master_key": "videos/hls/video_123/master.m3u8",
        }
    )

    assert job.job_type == "process_video"
    assert job.video_id == "video_123"
    assert job.thumbnail_key == "videos/thumbnails/video_123.jpg"
    assert job.preview_key == "videos/previews/video_123.mp4"
    assert job.hls_master_key == "videos/hls/video_123/master.m3u8"


def test_video_job_rejects_missing_required_fields():
    with pytest.raises(InvalidJobPayload) as exc:
        VideoJob.from_payload({"job_id": "job_123", "source_key": "raw.mp4"})

    assert "asset_id" in str(exc.value)
