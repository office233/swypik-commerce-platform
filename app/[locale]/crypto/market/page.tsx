"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Sparkles,
  ArrowDownUp,
} from "lucide-react";
import TradingViewChart from "@/components/crypto/TradingViewChart";
import SwapCard from "@/components/crypto/SwapCard";

const TOP_COINS = [
  { rank: 1, name: "Bitcoin", symbol: "BTC", price: "$65,420.00", change24h: "+2.45%", isUp: true, vol: "$28.4B" },
  { rank: 2, name: "Ethereum", symbol: "ETH", price: "$2,654.50", change24h: "+4.12%", isUp: true, vol: "$14.1B" },
  { rank: 3, name: "Solana", symbol: "SOL", price: "$152.80", change24h: "+6.85%", isUp: true, vol: "$4.9B" },
  { rank: 4, name: "Swypik Token", symbol: "SWYP", price: "$0.125", change24h: "+14.20%", isUp: true, vol: "$850K" },
];

export default function CryptoMarketPage() {
  const [selectedPair, setSelectedPair] = useState("ETH/USDT");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      {/* ── TICKER BAR TOP ─────────────────────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center gap-6 overflow-x-auto text-xs whitespace-nowrap">
        {TOP_COINS.map((c) => (
          <div
            key={c.symbol}
            onClick={() => setSelectedPair(`${c.symbol}/USDT`)}
            className="flex items-center gap-2 cursor-pointer hover:text-cyan-400 transition"
          >
            <span className="font-bold text-white">{c.symbol}</span>
            <span>{c.price}</span>
            <span className={`font-bold ${c.isUp ? "text-emerald-400" : "text-rose-400"}`}>
              {c.change24h}
            </span>
          </div>
        ))}
      </div>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold border border-cyan-500/30 uppercase tracking-wider mb-2">
              <ShieldCheck size={14} /> Web3 Non-Custodial Trading
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white">
              Piața Crypto & <span className="text-cyan-400">Tranzacții Reale</span>
            </h1>
            <p className="text-slate-400 text-sm max-w-xl">
              Grafice profesionale TradingView, date live și swap-uri on-chain descentralizate direct din portofelul tău.
            </p>
          </div>

          <Link
            href="/crypto/swap"
            className="self-start md:self-auto flex items-center gap-2 px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm shadow-xl transition"
          >
            <ArrowDownUp size={18} /> Terminal Swap Direct
          </Link>
        </div>

        {/* ── GRID PRINCIPAL: GRAFIC TRADINGVIEW + SWAP CARD ────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          {/* Grafic TradingView */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <TradingViewChart symbol={selectedPair} />
          </div>

          {/* Card Swap On-Chain */}
          <div className="lg:col-span-5 flex flex-col justify-start">
            <SwapCard />
          </div>
        </div>

        {/* ── TABEL MONEDE TOP ──────────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <h3 className="font-bold text-white text-base">Top Monede & Cotații Live</h3>
            <span className="text-xs text-slate-400">Actualizat în timp real via WebSocket</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">#</th>
                  <th className="px-6 py-3">Nume</th>
                  <th className="px-6 py-3">Preț</th>
                  <th className="px-6 py-3">Variație 24h</th>
                  <th className="px-6 py-3">Volum 24h</th>
                  <th className="px-6 py-3 text-right">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {TOP_COINS.map((coin) => (
                  <tr key={coin.symbol} className="hover:bg-slate-800/50 transition">
                    <td className="px-6 py-4 font-bold text-slate-500">{coin.rank}</td>
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                      <span>{coin.name}</span>
                      <span className="text-xs text-slate-400">{coin.symbol}</span>
                    </td>
                    <td className="px-6 py-4 font-extrabold">{coin.price}</td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1 font-bold text-emerald-400">
                        <ArrowUpRight size={16} /> {coin.change24h}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{coin.vol}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedPair(`${coin.symbol}/USDT`)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-xs font-bold transition"
                      >
                        Trade
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
