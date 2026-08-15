from __future__ import annotations

import os
import subprocess
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .config import Variant


class FfmpegMissingError(RuntimeError):
    pass


class FfmpegTimeoutError(RuntimeError):
    """ffmpeg a depășit bugetul de timp alocat și a fost omorât."""


#: Bugetul implicit (secunde) pentru o singură comandă ffmpeg. Suprascriere via
#: FFMPEG_TIMEOUT_SECONDS. Fără el, un fișier sursă malformat blochează la
#: infinit bucla single-threaded din main.py → toată coada de transcodare stă.
DEFAULT_FFMPEG_TIMEOUT_SECONDS = 900


def _ffmpeg_timeout_seconds() -> int:
    raw = os.environ.get("FFMPEG_TIMEOUT_SECONDS")
    if not raw:
        return DEFAULT_FFMPEG_TIMEOUT_SECONDS
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_FFMPEG_TIMEOUT_SECONDS
    return value if value > 0 else DEFAULT_FFMPEG_TIMEOUT_SECONDS


CommandRunner = Callable[[list[str]], None]


@dataclass(frozen=True)
class TranscodeResult:
    master_playlist: Path
    variant_playlists: dict[str, Path]
    thumbnail: Path
    preview: Path


class FfmpegTranscoder:
    def __init__(self, run_command: CommandRunner | None = None) -> None:
        self._run_command = run_command or self._default_runner

    def transcode(self, source_path: Path, output_dir: Path, variants: list[Variant]) -> TranscodeResult:
        self._ensure_ffmpeg()
        output_dir.mkdir(parents=True, exist_ok=True)

        playlists: dict[str, Path] = {}
        for variant in variants:
            variant_dir = output_dir / variant.name
            variant_dir.mkdir(parents=True, exist_ok=True)
            playlist = variant_dir / "index.m3u8"
            self._run_command(self._variant_command(source_path, playlist, variant))
            playlists[variant.name] = playlist

        master_playlist = output_dir / "master.m3u8"
        self._write_master_playlist(master_playlist, variants)

        preview = output_dir / "preview.mp4"
        self._run_command(self._preview_command(source_path, preview))

        thumbnail = output_dir / "thumbnail.jpg"
        self._run_command(self._thumbnail_command(source_path, thumbnail))

        return TranscodeResult(
            master_playlist=master_playlist,
            variant_playlists=playlists,
            thumbnail=thumbnail,
            preview=preview,
        )

    def _ensure_ffmpeg(self) -> None:
        if not shutil.which("ffmpeg"):
            raise FfmpegMissingError(
                "ffmpeg is not installed or is not on PATH; install ffmpeg to process videos"
            )

    @staticmethod
    def _variant_command(source_path: Path, playlist: Path, variant: Variant) -> list[str]:
        segment_pattern = playlist.parent / "segment_%05d.ts"
        return [
            "ffmpeg",
            "-y",
            "-i",
            str(source_path),
            "-vf",
            f"scale=w={variant.width}:h={variant.height}:force_original_aspect_ratio=decrease,"
            f"pad={variant.width}:{variant.height}:(ow-iw)/2:(oh-ih)/2",
            "-c:v",
            "h264",
            "-profile:v",
            "main",
            "-preset",
            "veryfast",
            "-b:v",
            variant.bitrate,
            "-maxrate",
            variant.bitrate,
            "-bufsize",
            _double_bitrate(variant.bitrate),
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-b:a",
            "128k",
            "-hls_time",
            "6",
            "-hls_playlist_type",
            "vod",
            "-hls_segment_filename",
            str(segment_pattern),
            str(playlist),
        ]

    @staticmethod
    def _thumbnail_command(source_path: Path, thumbnail: Path) -> list[str]:
        return [
            "ffmpeg",
            "-y",
            "-ss",
            "00:00:01",
            "-i",
            str(source_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(thumbnail),
        ]

    @staticmethod
    def _preview_command(source_path: Path, preview: Path) -> list[str]:
        return [
            "ffmpeg",
            "-y",
            "-i",
            str(source_path),
            "-t",
            "30",
            "-vf",
            "scale=w=720:h=1280:force_original_aspect_ratio=decrease,"
            "pad=720:1280:(ow-iw)/2:(oh-ih)/2",
            "-c:v",
            "h264",
            "-profile:v",
            "main",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(preview),
        ]

    @staticmethod
    def _write_master_playlist(path: Path, variants: list[Variant]) -> None:
        lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
        for variant in variants:
            bandwidth = _bitrate_to_bandwidth(variant.bitrate)
            lines.extend(
                [
                    f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={variant.width}x{variant.height}",
                    f"{variant.name}/index.m3u8",
                ]
            )
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    @staticmethod
    def _default_runner(command: list[str]) -> None:
        timeout_s = _ffmpeg_timeout_seconds()
        try:
            subprocess.run(
                command, check=True, capture_output=True, text=True, timeout=timeout_s
            )
        except FileNotFoundError as exc:
            raise FfmpegMissingError(
                "ffmpeg is not installed or is not on PATH; install ffmpeg to process videos"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            # subprocess.run omoară procesul copil înainte de a ridica excepția.
            raise FfmpegTimeoutError(
                f"ffmpeg command timed out after {timeout_s}s: {' '.join(command[:3])}"
            ) from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            raise RuntimeError(f"ffmpeg command failed: {stderr or exc}") from exc


def _bitrate_to_bandwidth(value: str) -> int:
    stripped = value.strip().lower()
    if stripped.endswith("k"):
        return int(float(stripped[:-1]) * 1000)
    if stripped.endswith("m"):
        return int(float(stripped[:-1]) * 1000 * 1000)
    return int(stripped)


def _double_bitrate(value: str) -> str:
    stripped = value.strip().lower()
    if stripped.endswith("k"):
        return f"{int(float(stripped[:-1]) * 2)}k"
    if stripped.endswith("m"):
        return f"{float(stripped[:-1]) * 2:g}m"
    return str(int(stripped) * 2)
