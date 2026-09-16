"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Users,
  Flame,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  ShoppingBag,
  Coins,
  Share2,
} from "lucide-react";
import type { SquadGroup } from "@/lib/squad/engine";

interface SquadStats {
  totalSquads: number;
  activeSquads: number;
  completedSquads: number;
  viralOrdersCount: number;
  extraRevenueCents: number;
}

interface SquadClientProps {
  initialSquads: SquadGroup[];
  initialStats: SquadStats;
}

export default function SquadClient({ initialSquads, initialStats }: SquadClientProps) {
  const [squads, setSquads] = useState<SquadGroup[]>(initialSquads);
  const [stats, setStats] = useState<SquadStats>(initialStats);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "expired">("all");

  const filteredSquads = squads.filter((s) => {
    if (filter === "all") return true;
    return s.status === filter;
  });

  const formatRon = (cents: number) => (cents / 100).toFixed(2) + " lei";

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-violet-950 via-purple-900 to-indigo-950 p-6 rounded-3xl border border-violet-800/40 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs font-black uppercase tracking-wider mb-2">
            <Flame size={14} className="text-orange-400" /> Group Buying Viral • Pinduoduo Model
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Campanii Swypik Squad Buy</h1>
          <p className="text-neutral-300 text-sm mt-1 max-w-2xl">
            Fiecare client care inițiază un Squad invită un prieten pe WhatsApp să cumpere produsul la -30% reducere.
            Generezi <strong>vânzări duble cu 0 lei cost de publicitate</strong> (CAC = 0).
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <Link
            href="/seller/products"
            className="px-4 py-2.5 rounded-xl bg-white text-neutral-950 font-black text-xs hover:bg-neutral-100 transition shadow"
          >
            Gestionează Produse
          </Link>
          <Link
            href="/squad"
            target="_blank"
            className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs transition shadow flex items-center gap-1.5"
          >
            Vezi Feed Public Squad <ExternalLink size={14} />
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-[#6E6E80] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Squad-uri Totale</span>
            <Users size={16} className="text-violet-600" />
          </div>
          <div className="text-2xl font-black text-[#0D0D0D]">{stats.totalSquads}</div>
          <p className="text-[11px] text-[#6E6E80] mt-1">inițiate de clienți</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-[#6E6E80] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Active Acum</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">{stats.activeSquads}</div>
          <p className="text-[11px] text-[#6E6E80] mt-1">așteaptă al 2-lea membru</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-[#6E6E80] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Finalizate (Succes)</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{stats.completedSquads}</div>
          <p className="text-[11px] text-[#6E6E80] mt-1">echipe de 2 complete</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-[#6E6E80] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Comenzi Virale</span>
            <ShoppingBag size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-600">{stats.viralOrdersCount}</div>
          <p className="text-[11px] text-[#6E6E80] mt-1">plasate prin recomandare</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] shadow-sm col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-[#6E6E80] text-xs font-bold uppercase tracking-wider mb-2">
            <span>Încasări Squad</span>
            <Coins size={16} className="text-violet-600" />
          </div>
          <div className="text-2xl font-black text-violet-700">{formatRon(stats.extraRevenueCents)}</div>
          <p className="text-[11px] text-emerald-600 font-bold mt-1">0 lei cheltuieli reclame</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E5E5E5] pb-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition ${
            filter === "all" ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Toate ({squads.length})
        </button>
        <button
          onClick={() => setFilter("active")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition ${
            filter === "active" ? "bg-amber-500 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Active ({squads.filter((s) => s.status === "active").length})
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition ${
            filter === "completed" ? "bg-emerald-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Completate ({squads.filter((s) => s.status === "completed").length})
        </button>
        <button
          onClick={() => setFilter("expired")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition ${
            filter === "expired" ? "bg-neutral-500 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Expirate ({squads.filter((s) => s.status === "expired").length})
        </button>
      </div>

      {/* Squads List */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-sm">
        {filteredSquads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-4">
              <Users size={28} />
            </div>
            <h3 className="text-base font-black text-[#0D0D0D]">Niciun Squad găsit</h3>
            <p className="text-xs text-[#6E6E80] mt-1 max-w-sm mx-auto">
              Clienții vor putea iniția squad-uri direct din pagina produselor tale din Swypik Shop pentru a primi -30% reducere.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F7F8] text-[#6E6E80] uppercase tracking-wider font-bold border-b border-[#E5E5E5]">
                <tr>
                  <th className="py-3 px-4">Produs</th>
                  <th className="py-3 px-4">Inițiator (Creator)</th>
                  <th className="py-3 px-4">Membri Înscriși</th>
                  <th className="py-3 px-4">Preț Squad vs Normal</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Data Inițierii</th>
                  <th className="py-3 px-4 text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {filteredSquads.map((squad) => (
                  <tr key={squad.id} className="hover:bg-neutral-50/80 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {squad.product_image ? (
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-neutral-100">
                            <Image src={squad.product_image} alt="" fill className="object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400">
                            <ShoppingBag size={16} />
                          </div>
                        )}
                        <span className="font-bold text-[#0D0D0D] max-w-[200px] truncate block">
                          {squad.product_title || "Produs"}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-[11px]">
                          {squad.creator_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-neutral-800">{squad.creator_name}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-neutral-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              squad.current_members >= squad.required_members ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                            style={{
                              width: `${(squad.current_members / squad.required_members) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="font-black text-neutral-900">
                          {squad.current_members}/{squad.required_members}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-neutral-900">{formatRon(squad.squad_price_cents)}</div>
                      <div className="text-[10px] text-neutral-400 line-through">
                        {formatRon(squad.regular_price_cents)}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {squad.status === "completed" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-black text-[10px] border border-emerald-200">
                          <CheckCircle2 size={12} /> Completat (2/2)
                        </span>
                      )}
                      {squad.status === "active" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-black text-[10px] border border-amber-200">
                          <Clock size={12} /> Activ (În așteptare)
                        </span>
                      )}
                      {squad.status === "expired" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600 font-bold text-[10px]">
                          <AlertCircle size={12} /> Expirat (Fonduri returnate)
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-neutral-500">
                      {new Date(squad.created_at).toLocaleDateString("ro-RO", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/squad/${squad.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-violet-50 hover:text-violet-700 text-neutral-700 font-bold transition text-[11px]"
                      >
                        Vezi Squad <ExternalLink size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
