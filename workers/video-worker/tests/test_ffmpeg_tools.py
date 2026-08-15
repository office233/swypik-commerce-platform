from pathlib import Path

import pytest

from video_worker.config import Variant
from video_worker.ffmpeg_tools import (
    DEFAULT_FFMPEG_TIMEOUT_SECONDS,
    FfmpegMissingError,
    FfmpegTimeoutError,
    FfmpegTranscoder,
    _ffmpeg_timeout_seconds,
)


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
    assert result.preview.name == "preview.mp4"
    assert result.variant_playlists == {"360p": tmp_path / "out" / "360p" / "index.m3u8"}
    assert len(commands) == 3
    assert commands[0][0] == "ffmpeg"
    assert "-vf" in commands[0]
    assert commands[-1][-1] == str(tmp_path / "out" / "thumbnail.jpg")
    assert commands[-2][-1] == str(tmp_path / "out" / "preview.mp4")


def test_default_runner_passes_timeout_to_subprocess(monkeypatch):
    """ffmpeg trebuie invocat MEREU cu un buget de timp (P1-01)."""
    captured: dict[str, object] = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["kwargs"] = kwargs
        return None

    monkeypatch.setattr("video_worker.ffmpeg_tools.subprocess.run", fake_run)
    monkeypatch.delenv("FFMPEG_TIMEOUT_SECONDS", raising=False)

    FfmpegTranscoder._default_runner(["ffmpeg", "-i", "in.mp4", "out.mp4"])

    assert captured["kwargs"]["timeout"] == DEFAULT_FFMPEG_TIMEOUT_SECONDS
    assert captured["kwargs"]["check"] is True


def test_slow_runner_raises_ffmpeg_timeout_error(monkeypatch):
    """Un ffmpeg care nu se mai termină e omorât și raportat, nu blochează coada."""
    import subprocess as _subprocess
    import time

    monkeypatch.setenv("FFMPEG_TIMEOUT_SECONDS", "1")

    def slow_run(command, **kwargs):
        # Simulează comportamentul real: subprocess.run omoară copilul lent
        # și ridică TimeoutExpired după `timeout` secunde.
        time.sleep(kwargs["timeout"])
        raise _subprocess.TimeoutExpired(cmd=command, timeout=kwargs["timeout"])

    monkeypatch.setattr("video_worker.ffmpeg_tools.subprocess.run", slow_run)

    started = time.monotonic()
    with pytest.raises(FfmpegTimeoutError) as exc:
        FfmpegTranscoder._default_runner(["ffmpeg", "-i", "hang.mp4", "out.mp4"])
    elapsed = time.monotonic() - started

    assert "timed out after 1s" in str(exc.value)
    # Se întoarce prompt (timeout + marjă), nu blochează workerul.
    assert elapsed < 5


def test_timeout_env_override_and_fallbacks(monkeypatch):
    monkeypatch.setenv("FFMPEG_TIMEOUT_SECONDS", "42")
    assert _ffmpeg_timeout_seconds() == 42

    for bad in ("0", "-5", "abc", ""):
        monkeypatch.setenv("FFMPEG_TIMEOUT_SECONDS", bad)
        assert _ffmpeg_timeout_seconds() == DEFAULT_FFMPEG_TIMEOUT_SECONDS

    monkeypatch.delenv("FFMPEG_TIMEOUT_SECONDS", raising=False)
    assert _ffmpeg_timeout_seconds() == DEFAULT_FFMPEG_TIMEOUT_SECONDS
