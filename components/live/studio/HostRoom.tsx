"use client";

import { LiveKitRoom, TrackToggle, VideoTrack, useLocalParticipant, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LiveConnection } from "../useLiveToken";

function LocalPreview() {
  const t = useTranslations("live.studio");
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera]).filter((tr) => tr.participant.identity === localParticipant.identity);
  const cam = tracks[0];
  if (!cam?.publication) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        {t("startingCamera")}
      </div>
    );
  }
  return <VideoTrack trackRef={cam} className="h-full w-full -scale-x-100 object-cover" />;
}

const toggleClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur [&_svg]:h-5 [&_svg]:w-5 data-[lk-enabled=false]:bg-danger";

/**
 * Camera gazdei conectată la LiveKit: publică video + audio din browser
 * (telefon sau desktop). Publicarea declanșează webhook-ul care trece
 * streamul în „live”.
 */
export default function HostRoom({ connection, onDisconnected }: { connection: LiveConnection; onDisconnected: () => void }) {
  const t = useTranslations("live.studio");
  return (
    <LiveKitRoom
      token={connection.token}
      serverUrl={connection.serverUrl}
      connect
      video={{ facingMode: "user", resolution: { width: 720, height: 1280 } }}
      audio
      onDisconnected={onDisconnected}
      className="relative h-full w-full bg-canvas"
    >
      <LocalPreview />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-3">
        <TrackToggle source={Track.Source.Microphone} showIcon className={toggleClass} aria-label={t("toggleMic")} />
        <TrackToggle source={Track.Source.Camera} showIcon className={toggleClass} aria-label={t("toggleCamera")} />
      </div>
    </LiveKitRoom>
  );
}
