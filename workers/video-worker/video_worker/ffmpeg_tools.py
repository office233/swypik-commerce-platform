from __future__ import annotations

import subprocess
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .config import Variant


class FfmpegMissingError(RuntimeError):
    pass


CommandRunner = Callable[[list[str]], None]


@dataclass(frozen=True)
class TranscodeResult:
    master_playlist: Path
    variant_playlists: dict[str, Path]
    thumbnail: Path


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

        thumbnail = output_dir / "thumbnail.jpg"
        self._run_command(self._thumbnail_command(source_path, thumbnail))

        return TranscodeResult(
            master_playlist=master_playlist,
            variant_playlists=playlists,
            thumbnail=thumbnail,
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
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
        except FileNotFoundError as exc:
            raise FfmpegMissingError(
                "ffmpeg is not installed or is not on PATH; install ffmpeg to process videos"
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
