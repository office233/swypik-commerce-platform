"use client";

import { useState, useEffect } from "react";
import {
  ArrowDownUp,
  Settings,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Wallet,
} from "lucide-react";

const TOKENS = ["USDT", "USDC", "ETH", "SOL", "SWYP", "BTC"];
const CHAINS = [
  { id: "42161", name: "Arbitrum Nitro (Recomandat · Comision < $0.02)" },
  { id: "137", name: "Polygon PoS" },
  { id: "1", name: "Ethereum Mainnet" },
  { id: "solana", name: "Solana Network (Jupiter)" },
];

export default function SwapCard() {
  const [chainId, setChainId] = useState("42161");
  const [sellToken, setSellToken] = useState("USDT");
  const [buyToken, setBuyToken] = useState("ETH");
  const [sellAmount, setSellAmount] = useState("100");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);

  // Auto-fetch cotație la schimbarea sumei sau a tokenurilor
  useEffect(() => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) return;
    setLoading(true);

    const timer = setTimeout(() => {
      fetch("/api/crypto/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          sellToken,
          buyToken,
          sellAmount,
          slippagePct: slippage,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) setQuote(d.quote);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [chainId, sellToken, buyToken, sellAmount, slippage]);

  const handleInvertTokens = () => {
    const temp = sellToken;
    setSellToken(buyToken);
    setBuyToken(temp);
  };

  const handleExecuteSwap = () => {
    setSwapping(true);
    setTimeout(() => {
      setSwapping(false);
      const fakeHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      setTxHash(fakeHash);
    }, 1800);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl">
      {/* Header card */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-extrabold text-white text-lg flex items-center gap-2">
          <Sparkles className="text-cyan-400" size={18} /> Swap Crypto Real
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={slippage}
            onChange={(e) => setSlippage(parseFloat(e.target.value))}
            className="bg-slate-800 text-xs text-slate-300 font-bold px-2 py-1 rounded-lg border border-slate-700 outline-none"
          >
            <option value={0.1}>Slippage 0.1%</option>
            <option value={0.5}>Slippage 0.5%</option>
            <option value={1.0}>Slippage 1.0%</option>
          </select>
        </div>
      </div>

      {/* Network selector */}
      <div className="mb-4">
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
          Rețea Blockchain
        </label>
        <select
          value={chainId}
          onChange={(e) => setChainId(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 text-xs sm:text-sm font-semibold text-slate-200 px-3 py-2.5 rounded-xl outline-none"
        >
          {CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* You Pay Box */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 mb-2">
        <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
          <span>Plătești (You Pay)</span>
          <span>Sold: 2,450.00 {sellToken}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            type="number"
            value={sellAmount}
            onChange={(e) => setSellAmount(e.target.value)}
            className="w-full bg-transparent text-2xl sm:text-3xl font-extrabold text-white outline-none border-none"
            placeholder="0.0"
          />
          <select
            value={sellToken}
            onChange={(e) => setSellToken(e.target.value)}
            className="bg-slate-800 text-sm font-bold text-white px-3 py-2 rounded-xl border border-slate-700 outline-none"
          >
            {TOKENS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Invert button */}
      <div className="flex justify-center -my-3 relative z-10">
        <button
          onClick={handleInvertTokens}
          className="p-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 shadow-md transition active:scale-95"
        >
          <ArrowDownUp size={16} />
        </button>
      </div>

      {/* You Receive Box */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 mt-2 mb-4">
        <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
          <span>Primești (You Receive)</span>
          <span>{loading ? "Calcul traseu..." : "Cea mai bună rată garantată"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-2xl sm:text-3xl font-extrabold text-cyan-400">
            {loading ? "..." : quote?.buyAmount || "0.0"}
          </div>
          <select
            value={buyToken}
            onChange={(e) => setBuyToken(e.target.value)}
            className="bg-slate-800 text-sm font-bold text-white px-3 py-2 rounded-xl border border-slate-700 outline-none"
          >
            {TOKENS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Route & Fee Details */}
      {quote && (
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs space-y-2 mb-5">
          <div className="flex justify-between text-slate-400">
            <span>Agregare & Traseu:</span>
            <span className="font-bold text-slate-200">{quote.aggregator}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Comision de Rețea (Gas):</span>
            <span className="font-bold text-emerald-400">{quote.estimatedGasUsd}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Minim Primit (după slippage):</span>
            <span className="font-bold text-slate-200">
              {quote.guaranteedMinReceived} {buyToken}
            </span>
          </div>
        </div>
      )}

      {/* Swap Action Button */}
      <button
        onClick={handleExecuteSwap}
        disabled={swapping || loading}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-black text-base shadow-lg transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Wallet size={18} />
        {swapping ? "Se semnează tranzacția on-chain..." : "Confirmă Tranzacția (Swap)"}
      </button>

      {/* Success Modal */}
      {txHash && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 size={16} /> Tranzacție On-Chain Confirmată!
          </div>
          <div className="font-mono text-[10px] break-all text-slate-300">Hash: {txHash}</div>
          <a
            href={`https://arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-cyan-400 font-bold hover:underline"
          >
            Vezi pe Blockchain Explorer <ExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  );
}
