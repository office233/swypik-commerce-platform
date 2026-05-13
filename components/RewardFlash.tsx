"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

interface RewardEventDetail {
  points: number;
  msg?: string;
  id: number;
}

export default function RewardFlash() {
  const [flashes, setFlashes] = useState<RewardEventDetail[]>([]);

  useEffect(() => {
    const handleReward = (e: Event) => {
      const customEvent = e as CustomEvent<Omit<RewardEventDetail, 'id'>>;
      const id = Date.now();
      
      setFlashes(prev => [...prev, { ...customEvent.detail, id }]);
      
      // Auto hide
      setTimeout(() => {
        setFlashes(prev => prev.filter(f => f.id !== id));
      }, 2000);
    };

    window.addEventListener("reward", handleReward);
    return () => window.removeEventListener("reward", handleReward);
  }, []);

  if (flashes.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideUpFade {
          0% {
            opacity: 0;
            transform: translate(-50%, 20px) scale(0.8);
          }
          20% {
            opacity: 1;
            transform: translate(-50%, 0px) scale(1.1);
          }
          30% {
            transform: translate(-50%, 0px) scale(1);
          }
          80% {
            opacity: 1;
            transform: translate(-50%, -10px);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -20px);
          }
        }
        .reward-anim {
          animation: slideUpFade 2s ease-out forwards;
        }
      `}</style>
      
      <div className="fixed bottom-32 left-1/2 z-50 pointer-events-none">
        {flashes.map((flash) => (
          <div 
            key={flash.id} 
            className="reward-anim absolute bottom-0 left-1/2 flex flex-col items-center justify-center whitespace-nowrap"
          >
            <div className="bg-gradient-to-r from-[#10A37F] to-emerald-500 text-white px-5 py-2 rounded-full shadow-[0_0_20px_rgba(16,163,127,0.5)] flex items-center gap-2 border border-emerald-400 font-black mb-1">
              <Zap className="w-5 h-5 fill-current text-yellow-300 drop-shadow-md" />
              <span className="text-xl tracking-wider">+{flash.points}</span>
            </div>
            {flash.msg && (
              <span className="text-white text-sm font-semibold tracking-wide drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] px-3 py-1 bg-black/40 backdrop-blur-sm rounded-lg border border-white/10">
                {flash.msg}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
