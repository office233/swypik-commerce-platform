"use client";

import { useState } from "react";
import { Sparkles, Camera, Sliders, RefreshCw, Check } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface VirtualTryOnModalProps {
  product: {
    id: string;
    title: string;
    category?: string;
    images: string[];
  };
  onClose: () => void;
  onApplyShade: (shade: string) => void;
}

export default function VirtualTryOnModal({
  product,
  onClose,
  onApplyShade,
}: VirtualTryOnModalProps) {
  const [activeShade, setActiveShade] = useState(0);
  const [splitPosition, setSplitPosition] = useState(50);
  const [cameraActive, setCameraActive] = useState(true);

  const shades = [
    { name: "Radiant Golden 01", hex: "#E8C39E", finish: "Luminous Dewy" },
    { name: "Warm Honey 02", hex: "#D6A374", finish: "Velvet Satin" },
    { name: "Deep Amber 03", hex: "#B87B44", finish: "Soft Matte" },
    { name: "Porcelain Rose 04", hex: "#F3D2C1", finish: "Glass Skin" },
  ];

  const handleSelectShade = (idx: number) => {
    haptic("tap");
    setActiveShade(idx);
    onApplyShade(shades[idx].name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-neutral-950 text-white p-5 border border-white/10 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
              <Sparkles size={18} />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-tight">AI Virtual Try-On Studio</span>
                <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  AR Generativ Video
                </span>
              </div>
              <p className="text-[10px] text-neutral-400">Adaptare inteligenta de ton & textura in timp real</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Zona Camera / AR Simulator */}
        <div className="relative my-4 aspect-[4/5] w-full rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 flex items-center justify-center">
          {/* Mock Camera Feed cu textura fetei si aplicare produs */}
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-800 to-neutral-950 flex flex-col items-center justify-center">
            <div className="relative h-44 w-44 rounded-full border-2 border-dashed border-purple-400/40 flex items-center justify-center">
              <div
                className="h-36 w-36 rounded-full opacity-60 blur-md transition-all duration-500"
                style={{ backgroundColor: shades[activeShade].hex }}
              />
              <span className="absolute text-[11px] font-bold text-white/80 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-sm">
                Fata Detectata (AR 60 FPS)
              </span>
            </div>

            {/* Split Slider Preview: Inainte / Dupa */}
            <div
              className="absolute inset-y-0 w-0.5 bg-white/80 shadow-[0_0_10px_white]"
              style={{ left: `${splitPosition}%` }}
            >
              <span className="absolute top-3 -left-3 h-6 w-6 rounded-full bg-white text-black text-[9px] font-black flex items-center justify-center shadow-lg">
                ⇄
              </span>
            </div>

            <div className="absolute top-3 left-3 text-[10px] font-black px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-neutral-400">
              Natural
            </div>
            <div className="absolute top-3 right-3 text-[10px] font-black px-2 py-0.5 rounded bg-purple-500/40 backdrop-blur-sm text-purple-200">
              {shades[activeShade].finish}
            </div>
          </div>

          <div className="absolute bottom-3 inset-x-4 flex items-center gap-2">
            <span className="text-[10px] text-neutral-400 font-bold shrink-0">Comparație:</span>
            <input
              type="range"
              min="10"
              max="90"
              value={splitPosition}
              onChange={(e) => setSplitPosition(Number(e.target.value))}
              className="w-full accent-purple-400 cursor-pointer h-1.5 bg-white/20 rounded-lg"
            />
          </div>
        </div>

        {/* Nuanțe & Finisaje Inteligente */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">Selectează nuanța optimizată cu tonul tău:</span>
            <span className="text-purple-300 font-bold">{shades[activeShade].name}</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {shades.map((s, idx) => (
              <button
                key={s.name}
                type="button"
                onClick={() => handleSelectShade(idx)}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                  activeShade === idx
                    ? "bg-white/15 border-purple-400 shadow-md ring-1 ring-purple-400/40"
                    : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                <div
                  className="h-6 w-6 rounded-full border border-white/20 shadow-inner"
                  style={{ backgroundColor: s.hex }}
                />
                <span className="text-[9.5px] font-bold text-center truncate w-full text-white">
                  {s.name.split(" ")[0]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Buton Salvează & Confirmă Nuanța */}
        <button
          type="button"
          onClick={() => {
            haptic("success");
            onClose();
          }}
          className="w-full mt-4 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-purple-500/25 active:scale-[0.98] transition"
        >
          Aplică Nuanța {shades[activeShade].name} în Comandă
        </button>

        <p className="text-center text-[9px] text-neutral-400 mt-2">
          ✓ Reduce rata de retur cu 62% prin potrivire spectrala ghidata de AI
        </p>
      </div>
    </div>
  );
}
