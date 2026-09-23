"use client";

import { useEffect, useState } from "react";
import { X, Maximize2, Minimize2, RotateCcw, Trophy, Sparkles } from "lucide-react";

interface GamePlayerModalProps {
  game: {
    id: string;
    title: string;
    embed_url: string;
  } | null;
  onClose: () => void;
}

export default function GamePlayerModal({ game, onClose }: GamePlayerModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scoreAlert, setScoreAlert] = useState<{ score: number; xp: number } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (!game) return;

    const handleMessage = async (e: MessageEvent) => {
      if (e.data?.type === "SWYPIK_GAME_OVER") {
        const { score, durationMs } = e.data;
        try {
          const res = await fetch("/api/gaming/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gameId: game.id,
              score: Number(score) || 0,
              durationMs: Number(durationMs) || 5000,
            }),
          });
          const data = await res.json();
          if (data.ok) {
            setScoreAlert({ score: data.score, xp: data.earnedXp });
            setTimeout(() => setScoreAlert(null), 4000);
          }
        } catch (err) {
          console.error("Score submit error", err);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [game]);

  if (!game) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div
        className={`relative flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isFullscreen ? "w-screen h-screen rounded-none" : "w-full max-w-lg h-[85vh]"
        }`}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-bold text-white text-base truncate">{game.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Restart Joc"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title={isFullscreen ? "Ieși din Fullscreen" : "Ecran Complet"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition"
              title="Închide"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Score Alert Toast */}
        {scoreAlert && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-sm rounded-full shadow-lg animate-bounce">
            <Trophy size={16} />
            <span>Scor salvat: {scoreAlert.score}! +{scoreAlert.xp} XP</span>
            <Sparkles size={16} />
          </div>
        )}

        {/* Iframe Sandbox */}
        <div className="flex-1 w-full h-full relative bg-slate-950">
          <iframe
            key={iframeKey}
            src={game.embed_url}
            sandbox="allow-scripts allow-same-origin allow-forms"
            allow="autoplay; fullscreen"
            className="w-full h-full border-0"
            title={game.title}
          />
        </div>
      </div>
    </div>
  );
}
