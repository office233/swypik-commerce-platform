"use client";

import React, { useEffect, useState } from "react";
import { Wifi, WifiOff, HardDrive, AlertTriangle } from "lucide-react";

export function LocalNodeIndicator() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [nodeId, setNodeId] = useState<string | null>(null);
  /** Latenta masurata (dus-intors) a ultimului heartbeat; null pana la prima masuratoare. */
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);

  useEffect(() => {
    // Check browser online event
    const handleOnline = () => {
      setIsOnline(true);
      setShowWarningModal(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowWarningModal(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial status fetch
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/seller/node/status");
        if (res.ok) {
          const data = await res.json();
          if (data.node?.nodeId) setNodeId(data.node.nodeId);
        }
      } catch (e) {
        // network issue
      }
    };

    fetchStatus();

    // Heartbeat loop every 15s
    const interval = setInterval(async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        setShowWarningModal(true);
        return;
      }

      if (!nodeId) return;
      try {
        const startedAt = performance.now();
        const res = await fetch("/api/seller/node/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId, isOnline: true, pingMs: pingMs ?? 0 }),
        });
        setPingMs(Math.round(performance.now() - startedAt));
        if (res.ok) {
          setIsOnline(true);
          setShowWarningModal(false);
        } else {
          setIsOnline(false);
          setShowWarningModal(true);
        }
      } catch {
        setIsOnline(false);
        setShowWarningModal(true);
      }
    }, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [nodeId, pingMs]);

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-neutral-200 text-xs font-medium shadow-sm backdrop-blur-sm">
        <span className="relative flex h-2 w-2">
          {isOnline ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-rose-600" />
          )}
          <span className={isOnline ? "text-neutral-800 font-bold" : "text-rose-600 font-bold"}>
            {isOnline ? "Nod Online" : "Nod Deconectat"}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-neutral-200 text-[11px] text-neutral-500">
          <HardDrive className="w-3 h-3 text-neutral-400" />
          <span className="font-mono">{nodeId ? nodeId.slice(0, 14) : "…"}</span>
          <span className="text-neutral-300">•</span>
          <span className="text-emerald-600 font-mono">{pingMs === null ? "—" : `${pingMs}ms`}</span>
        </div>
      </div>

      {/* Critical Modal if Node is Offline */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border-2 border-rose-500 space-y-4 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-[#0D0D0D]">Nodul Local este Deconectat!</h3>
              <p className="text-xs text-rose-600 font-bold">
                Conexiunea la internet este obligatorie pentru funcționarea ERP-ului.
              </p>
            </div>

            <p className="text-xs text-neutral-600 text-left bg-rose-50 p-3.5 rounded-xl border border-rose-100 leading-relaxed">
              Fără conexiune la internet, panoul nu poate primi comenzi noi și nu poate înregistra vânzări POS.
            </p>

            <button
              type="button"
              onClick={() => {
                if (navigator.onLine) {
                  setIsOnline(true);
                  setShowWarningModal(false);
                } else {
                  alert("Conexiunea la internet este în continuare inactivă. Verificați cablul sau semnalul Wi-Fi.");
                }
              }}
              className="w-full py-3 bg-[#0D0D0D] hover:bg-neutral-800 text-white rounded-xl font-bold text-xs shadow-md transition"
            >
              Reîncearcă Conectarea la Rețeaua Swypik
            </button>
          </div>
        </div>
      )}
    </>
  );
}
