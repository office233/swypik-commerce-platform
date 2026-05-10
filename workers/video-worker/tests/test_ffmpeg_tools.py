from pathlib import Path

import pytest

from video_worker.config import Variant
from video_worker.ffmpeg_tools import FfmpegMissingError, FfmpegTranscoder


def test_transcoder_reports_missing_ffmpeg(monkeypatch, tmp_path):
    monkeypatch.setattr("video_worker.ffmpeg_tools.shutil.which", lambda _: None)
    source = tmp_path / "input.mp4"
    source.write_bytes(b"not a real video")

    transcoder = FfmpegTranscoder()

    with pytest.raises(FfmpegMissingError) as exc:
        transcoder.transcode(
            source_path=source,
            output_dir=tmp_path / "out",
            variants=[Variant(name="360p", width=640, height=360, bitrate="800k")],
        )

    assert "ffmpeg" in str(exc.value)


def test_transcoder_builds_hls_outputs_with_injected_runner(monkeypatch, tmp_path):
    monkeypatch.setattr("video_worker.ffmpeg_tools.shutil.which", lambda name: f"/usr/bin/{name}")
    commands = []

    def fake_runner(command):
        commands.append(command)
        output = Path(command[-1])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("#EXTM3U\n", encoding="utf-8")

    source = tmp_path / "input.mp4"
    source.write_bytes(b"fake")

    result = FfmpegTranscoder(run_command=fake_runner).transcode(
        source_path=source,
        output_dir=tmp_path / "out",
        variants=[Variant(name="360p", width=640, height=360, bitrate="800k")],
    )

    assert result.master_playlist.name == "master.m3u8"
    assert result.thumbnail.name == "thumbnail.jpg"
    assert result.variant_playlists == {"360p": tmp_path / "out" / "360p" / "index.m3u8"}
    assert len(commands) == 2
    assert commands[0][0] == "ffmpeg"
    assert "-vf" in commands[0]
    assert commands[-1][-1] == str(tmp_path / "out" / "thumbnail.jpg")
