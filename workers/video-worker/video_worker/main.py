from __future__ import annotations

import argparse
import logging
import signal
import sys

from .config import Settings
from .db import PostgresRepository
from .ffmpeg_tools import FfmpegTranscoder
from .models import VideoJob
from .redis_queue import QueueUnavailableError, RedisQueue
from .storage import S3Storage
from .worker import VideoProcessor


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Swypik video processing worker")
    parser.add_argument("--once", action="store_true", help="Process one job and exit")
    parser.add_argument("--job-json", help="Process one inline JSON job payload instead of Redis")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)

    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(message)s")
    settings = Settings.from_env()
    processor = VideoProcessor(settings, S3Storage(settings), FfmpegTranscoder(), PostgresRepository(settings))

    if args.job_json:
        result = processor.process(VideoJob.from_payload(args.job_json))
        return 0 if result.ok else 1

    queue = RedisQueue(settings)
    stop = _StopFlag()
    signal.signal(signal.SIGINT, stop.handle)
    signal.signal(signal.SIGTERM, stop.handle)

    try:
        while not stop.requested:
            queued = queue.pop_message()
            if queued is None:
                if args.once:
                    return 0
                continue
            result = processor.process(queued.job)
            if result.ok:
                queue.ack(queued)
            else:
                queue.fail(queued, result.message)
            if args.once:
                return 0 if result.ok else 1
    except QueueUnavailableError as exc:
        logging.error("%s", exc)
        return 2

    return 0


class _StopFlag:
    def __init__(self) -> None:
        self.requested = False

    def handle(self, *_args) -> None:
        self.requested = True


if __name__ == "__main__":
    sys.exit(main())
