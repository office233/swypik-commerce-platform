"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import SwapCard from "@/components/crypto/SwapCard";

export default function CryptoSwapPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mb-4 flex justify-between items-center">
        <Link
          href="/crypto/market"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition font-semibold"
        >
          <ArrowLeft size={16} /> Înapoi la Piață
        </Link>
        <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold">
          <ShieldCheck size={14} /> Tranzacție Non-Custodial
        </span>
      </div>

      <SwapCard />
    </div>
  );
}
