"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Maximize2, Minimize2, RotateCcw, Trophy, Sparkles } from "lucide-react";
import { logger } from "@/lib/logger";
import { isSafeGameUrl, isGameOverMessage } from "@/lib/gaming/postmessage";

interface GamePlayerModalProps {
  game: {
    id: string;
    title: string;
    embed_url: string;
  } | null;
  onClose: () => void;
  /** Called after a score submission changes the user's XP/SWYP, so the
   *  header profile widget can refresh. */
  onScoreChanged?: () => void;
}

export default function GamePlayerModal({ game, onClose, onScoreChanged }: GamePlayerModalProps) {
  const t = useTranslations("gaming");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scoreAlert, setScoreAlert] = useState<{ score: number; xp: number } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const sessionTokenRef = useRef<string | null>(null);

  // Start a fresh signed session (server-side duration measurement) every
  // time a game is opened or restarted.
  useEffect(() => {
    if (!game) {
      sessionTokenRef.current = null;
      return;
    }
    sessionTokenRef.current = null;
    fetch("/api/gaming/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: game.id }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) sessionTokenRef.current = d.sessionToken;
      })
      .catch((e) => logger.warn({ err: e }, "[gaming.modal] session start failed"));
  }, [game, iframeKey]);

  useEffect(() => {
    if (!game) return;

    const handleMessage = async (e: MessageEvent) => {
      // Only trust postMessage events from this same origin — the iframe is
      // same-origin (served from /games/ on this domain), so a legitimate
      // score message always carries our own origin.
      if (e.origin !== window.location.origin) return;
      if (!isGameOverMessage(e.data)) return;
      if (e.data.gameId !== game.id) return;

      const sessionToken = sessionTokenRef.current;
      if (!sessionToken) return;

      try {
        const res = await fetch("/api/gaming/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId: game.id,
            score: Math.max(0, Math.floor(e.data.score)),
            sessionToken,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setScoreAlert({ score: data.score, xp: data.earnedXp });
          setTimeout(() => setScoreAlert(null), 4000);
          onScoreChanged?.();
        }
        // Token is single-use server-side regardless of outcome.
        sessionTokenRef.current = null;
      } catch (err) {
        logger.warn({ err }, "[gaming.modal] score submit failed");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [game, onScoreChanged]);

  if (!game) return null;
  if (!isSafeGameUrl(game.embed_url)) {
    logger.error({ gameId: game.id, embedUrl: game.embed_url }, "[gaming.modal] refusing to load unsafe game url");
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div
        className={`relative flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isFullscreen ? "w-screen h-screen rounded-none" : "w-full max-w-lg h-[85vh]"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-bold text-white text-base truncate">{game.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title={t("modalRestart")}
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title={isFullscreen ? t("modalExitFullscreen") : t("modalFullscreen")}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition"
              title={t("modalClose")}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {scoreAlert && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-sm rounded-full shadow-lg animate-bounce">
            <Trophy size={16} />
            <span>{t("modalScoreSaved", { score: scoreAlert.score, xp: scoreAlert.xp })}</span>
            <Sparkles size={16} />
          </div>
        )}

        <div className="flex-1 w-full h-full relative bg-slate-950">
          <iframe
            key={iframeKey}
            src={game.embed_url}
            sandbox="allow-scripts allow-same-origin"
            allow="autoplay; fullscreen"
            className="w-full h-full border-0"
            title={game.title}
          />
        </div>
      </div>
    </div>
  );
}
