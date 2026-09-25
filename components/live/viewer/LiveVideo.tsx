"use client";

import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { VideoOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LiveConnection } from "../useLiveToken";

function HostVideo() {
  const t = useTranslations("live.viewer");
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const host = tracks.find((tr) => tr.participant.identity.startsWith("host:"));
  if (!host) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
        <VideoOff className="h-8 w-8" aria-hidden />
        {t("waitingForHost")}
      </div>
    );
  }
  return <VideoTrack trackRef={host} className="h-full w-full object-cover" />;
}

/** Abonare WebRTC la camera gazdei (doar recepție; spectatorii nu pot publica). */
export default function LiveVideo({ connection, onDisconnected }: { connection: LiveConnection; onDisconnected: () => void }) {
  const t = useTranslations("live.viewer");
  return (
    <LiveKitRoom
      token={connection.token}
      serverUrl={connection.serverUrl}
      connect
      audio={false}
      video={false}
      onDisconnected={onDisconnected}
      className="relative h-full w-full bg-canvas"
    >
      <HostVideo />
      <RoomAudioRenderer />
      {/* Browserele blochează sunetul automat: butonul apare doar când e nevoie. */}
      <StartAudio
        label={t("tapForSound")}
        className="absolute left-1/2 top-1/2 z-10 min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-5 text-sm font-semibold text-white backdrop-blur"
      />
    </LiveKitRoom>
  );
}
