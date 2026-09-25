"use client";

import MovieEpisodeBadge from "@/components/movies/MovieEpisodeBadge";
import type { FeedVideo } from "@/lib/feed/types";
import ActionRail, { type ActionRailProps } from "./ActionRail";
import FeedPlayer, { type FeedPlayerProps } from "./FeedPlayer";
import VideoInfo from "./VideoInfo";

type Props = Omit<ActionRailProps, "video"> &
  Pick<FeedPlayerProps, "active" | "muted" | "autoPlay" | "captionLang" | "registerEl" | "onTimeUpdate"> & {
    video: FeedVideo;
    /** Montăm player-ul doar pentru slide-ul activ și vecini (preîncărcare). */
    mounted: boolean;
    onOpenProduct: () => void;
  };

/** Un clip pe ecran întreg: player (sau poster), gradient, info, rail de acțiuni. */
export default function VideoSlide({ video, mounted, active, muted, autoPlay, captionLang, registerEl, onTimeUpdate, onOpenProduct, ...rail }: Props) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {mounted ? (
        <FeedPlayer
          video={video}
          active={active}
          muted={muted}
          autoPlay={autoPlay}
          captionLang={captionLang}
          registerEl={registerEl}
          onTimeUpdate={onTimeUpdate}
        />
      ) : video.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- poster din CDN-ul media; clipurile îndepărtate nu montează <video>
        <img src={video.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/35 to-transparent" aria-hidden />
      {mounted && video.movie ? <MovieEpisodeBadge movie={video.movie} /> : null}
      {mounted ? (
        <>
          <VideoInfo video={video} onOpenProduct={onOpenProduct} />
          <ActionRail video={video} {...rail} />
        </>
      ) : null}
    </div>
  );
}
