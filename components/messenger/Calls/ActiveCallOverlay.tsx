"use client";

import { useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Maximize2, Minimize2, PhoneOff } from "lucide-react";
import { useTranslations } from "next-intl";

interface ActiveCallOverlayProps {
  serverUrl: string;
  token: string;
  callType?: "audio" | "video";
  onDisconnect: () => void;
}

export default function ActiveCallOverlay({
  serverUrl,
  token,
  callType = "video",
  onDisconnect,
}: ActiveCallOverlayProps) {
  const t = useTranslations("messenger.activeCall");
  const [isPip, setIsPip] = useState(false);

  return (
    <div
      className={
        isPip
          ? "fixed bottom-5 right-5 z-50 h-72 w-96 rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl overflow-hidden transition-all duration-300 flex flex-col"
          : "fixed inset-0 z-50 flex flex-col bg-[#0b141a] text-white"
      }
    >
      {/* Top action bar */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        <button
          onClick={() => setIsPip(!isPip)}
          className="rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 p-2.5 backdrop-blur-md border border-slate-700 transition"
          title={isPip ? t("expand") : t("minimize")}
          aria-label={isPip ? t("expand") : t("minimize")}
        >
          {isPip ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
        </button>
        <button
          onClick={onDisconnect}
          className="rounded-full bg-rose-600 hover:bg-rose-500 text-white p-2.5 shadow-lg transition"
          title={t("end")}
          aria-label={t("end")}
        >
          <PhoneOff size={18} />
        </button>
      </div>

      <div className="flex-1 w-full h-full relative">
        <LiveKitRoom
          video={callType === "video"}
          audio={true}
          token={token}
          serverUrl={serverUrl}
          data-lk-theme="default"
          onDisconnected={onDisconnect}
          className="flex-1 flex flex-col h-full w-full"
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </div>
  );
}
