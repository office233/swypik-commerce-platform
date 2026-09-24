"use client";

import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";

interface IncomingCallDialogProps {
  callerName: string;
  callerAvatar?: string;
  callType: "audio" | "video";
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallDialog({
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onReject,
}: IncomingCallDialogProps) {
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sintetizator ton de apel stil WhatsApp prin Web Audio API
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        let isRunning = true;
        const playRing = () => {
          if (!isRunning || ctx.state === "closed") return;
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.frequency.value = 440; // A4
          osc2.frequency.value = 480; // B4

          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start();
          osc2.start();
          osc1.stop(ctx.currentTime + 1.2);
          osc2.stop(ctx.currentTime + 1.2);

          if (isRunning) {
            setTimeout(playRing, 3000);
          }
        };

        playRing();

        return () => {
          isRunning = false;
          ctx.close().catch(() => null);
        };
      }
    } catch (e) {
      console.warn("AudioContext ring error", e);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[#111b21] border border-slate-700 rounded-3xl p-6 text-center shadow-2xl flex flex-col items-center">
        {/* Pulsing Avatar */}
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-emerald-500 shadow-xl bg-slate-800 flex items-center justify-center">
            {callerAvatar ? (
              <img src={callerAvatar} alt={callerName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-emerald-400">
                {callerName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <h3 className="text-xl font-bold text-white mb-1">{callerName}</h3>
        <p className="text-slate-400 text-sm flex items-center gap-1.5 mb-8">
          {callType === "video" ? <Video size={16} className="text-violet-400" /> : <Phone size={16} className="text-violet-400" />}
          Apel {callType === "video" ? "Video HD" : "Audio Clar"} Swypik...
        </p>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-12 w-full">
          {/* Decline */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onReject}
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transition active:scale-95"
            >
              <PhoneOff size={26} />
            </button>
            <span className="text-xs text-slate-400">Refuză</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onAccept}
              className="w-16 h-16 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-xl shadow-violet-500/25 transition active:scale-95 animate-pulse"
            >
              <Phone size={26} />
            </button>
            <span className="text-xs text-violet-400 font-bold">Răspunde</span>
          </div>
        </div>
      </div>
    </div>
  );
}
