"use client";

import { useState } from "react";
import { Radio } from "lucide-react";

interface StationBadgeProps {
  id?: string;
  slug?: string;
  title: string;
  coverUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const STATION_PRESETS: Record<string, { bg: string; text: string; sub?: string; accent: string }> = {
  "kiss-fm": {
    bg: "from-[#F43F5E] via-[#E11D48] to-[#9F1239]",
    text: "KISS",
    sub: "FM",
    accent: "text-white font-black italic tracking-tighter",
  },
  "radio-zu": {
    bg: "from-[#84CC16] via-[#65A30D] to-[#3F6212]",
    text: "ZU",
    sub: "RADIO",
    accent: "text-white font-black tracking-tight",
  },
  "europa-fm": {
    bg: "from-[#2563EB] via-[#1D4ED8] to-[#1E3A8A]",
    text: "EUROPA",
    sub: "FM",
    accent: "text-white font-black tracking-wider",
  },
  "rock-fm": {
    bg: "from-[#27272A] via-[#18181B] to-[#09090B]",
    text: "ROCK",
    sub: "FM",
    accent: "text-red-500 font-black tracking-widest",
  },
  "magic-fm": {
    bg: "from-[#9333EA] via-[#7E22CE] to-[#4C1D95]",
    text: "MAGIC",
    sub: "FM",
    accent: "text-amber-300 font-black tracking-wide",
  },
  "digi-fm": {
    bg: "from-[#0284C7] via-[#0369A1] to-[#0C4A6E]",
    text: "DIGI",
    sub: "FM",
    accent: "text-cyan-300 font-black tracking-tight",
  },
  "virgin-radio": {
    bg: "from-[#EF4444] via-[#DC2626] to-[#991B1B]",
    text: "Virgin",
    sub: "RADIO",
    accent: "text-white font-black italic",
  },
  "pro-fm": {
    bg: "from-[#C026D3] via-[#A21CAF] to-[#701A75]",
    text: "PRO",
    sub: "FM",
    accent: "text-white font-black tracking-tight",
  },
  "radio-guerrilla": {
    bg: "from-[#1E293B] via-[#0F172A] to-[#020617]",
    text: "GUERRILLA",
    sub: "RADIO",
    accent: "text-[#EC4899] font-black uppercase tracking-tight",
  },
  "dance-fm": {
    bg: "from-[#F97316] via-[#EA580C] to-[#9A3412]",
    text: "DANCE",
    sub: "FM 89.5",
    accent: "text-white font-black tracking-tight",
  },
};

function getPreset(slug?: string, title?: string) {
  const norm = (slug || title || "").toLowerCase();
  for (const [key, val] of Object.entries(STATION_PRESETS)) {
    if (norm.includes(key) || key.replace("-", "").includes(norm.replace(/[^a-z]/g, ""))) {
      return val;
    }
  }
  return null;
}

export default function StationBadge({
  slug,
  title,
  coverUrl,
  size = "md",
  className = "",
}: StationBadgeProps) {
  const [imgError, setImgError] = useState(false);
  const preset = getPreset(slug, title);

  const sizeClasses = {
    sm: "h-10 w-10 text-[10px]",
    md: "h-14 w-14 sm:h-16 sm:w-16 text-xs",
    lg: "h-20 w-20 text-sm",
  }[size];

  // Ignoră URL-urile externe cunoscute că pică (wikimedia 400 etc)
  const isBadUrl = !coverUrl || coverUrl.includes("wikimedia.org") || imgError;

  if (!isBadUrl && coverUrl) {
    return (
      <div className={`relative shrink-0 overflow-hidden rounded-2xl bg-white/10 p-1 shadow-md ${sizeClasses} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  if (preset) {
    return (
      <div
        className={`relative shrink-0 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${preset.bg} p-1 text-center shadow-lg ring-1 ring-white/20 select-none overflow-hidden ${sizeClasses} ${className}`}
      >
        <span className={`${preset.accent} leading-tight drop-shadow-sm`}>
          {preset.text}
        </span>
        {preset.sub && (
          <span className="text-[8px] sm:text-[9px] font-bold text-white/80 uppercase tracking-widest leading-none mt-0.5">
            {preset.sub}
          </span>
        )}
      </div>
    );
  }

  // Fallback generic elegant cu radio wave
  return (
    <div
      className={`relative shrink-0 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-900 p-2 text-center shadow-md ring-1 ring-white/10 select-none ${sizeClasses} ${className}`}
    >
      <Radio className="text-white/90 mb-0.5" size={size === "sm" ? 16 : 22} />
      <span className="text-[8px] font-bold text-white/90 uppercase tracking-tight line-clamp-1 max-w-[90%]">
        {title.slice(0, 5)}
      </span>
    </div>
  );
}
