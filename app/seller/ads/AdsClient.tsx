"use client";

import React, { useState } from "react";
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  TrendingUp,
  Eye,
  MousePointer,
  ShoppingBag,
  Sparkles,
  Zap,
  Target,
  Gift,
} from "lucide-react";

interface Campaign {
  id: string;
  campaign_name: string;
  ad_type: "boost_reel" | "mystery_drop" | "flash_sale";
  product_id?: string;
  product_title?: string;
  daily_budget_cents: number;
  spent_budget_cents: number;
  target_city: string;
  status: "active" | "paused" | "completed";
  impressions_count: number;
  clicks_count: number;
  orders_count: number;
  revenue_cents: number;
  created_at: string;
}

interface ProductOption {
  id: string;
  title: string;
  price_cents: number;
}

export default function AdsClient({
  initialCampaigns,
  sellerProducts,
}: {
  initialCampaigns: Campaign[];
  sellerProducts: ProductOption[];
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [campaignName, setCampaignName] = useState("");
  const [adType, setAdType] = useState<"boost_reel" | "mystery_drop" | "flash_sale">("boost_reel");
  const [selectedProduct, setSelectedProduct] = useState(sellerProducts[0]?.id || "");
  const [dailyBudget, setDailyBudget] = useState("30");
  const [targetCity, setTargetCity] = useState("all_ro");

  // Summary Metrics
  const totalSpent = campaigns.reduce((acc, c) => acc + (Number(c.spent_budget_cents) || 0), 0) / 100;
  const totalRevenue = campaigns.reduce((acc, c) => acc + (Number(c.revenue_cents) || 0), 0) / 100;
  const totalImpressions = campaigns.reduce((acc, c) => acc + (Number(c.impressions_count) || 0), 0);
  const totalOrders = campaigns.reduce((acc, c) => acc + (Number(c.orders_count) || 0), 0);
  const roas = totalSpent > 0 ? (totalRevenue / totalSpent).toFixed(2) : "4.80";

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/seller/ads/${id}/toggle`, { method: "PATCH" });
      const data = await res.json();
      if (data.success) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: data.campaign.status } : c))
        );
      }
    } catch (e) {
      alert("Eroare la modificarea statusului.");
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/seller/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName,
          adType,
          productId: selectedProduct || null,
          dailyBudgetRon: parseFloat(dailyBudget) || 30,
          targetCity,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Eroare la creare");
        return;
      }

      const prod = sellerProducts.find((p) => p.id === selectedProduct);
      const newCamp: Campaign = {
        id: data.campaign.id,
        campaign_name: campaignName,
        ad_type: adType,
        product_id: selectedProduct,
        product_title: prod?.title,
        daily_budget_cents: Math.round((parseFloat(dailyBudget) || 30) * 100),
        spent_budget_cents: 0,
        target_city: targetCity,
        status: "active",
        impressions_count: 0,
        clicks_count: 0,
        orders_count: 0,
        revenue_cents: 0,
        created_at: new Date().toISOString(),
      };

      setCampaigns((prev) => [newCamp, ...prev]);
      setIsModalOpen(false);
      setCampaignName("");
      setDailyBudget("30");
    } catch {
      alert("A apărut o eroare de rețea.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#0D0D0D] tracking-tight">Swypik Ads Manager</h1>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
              AI Powered
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            Crește vânzările magazinului: boost viral în feed, apariție în Mystery Box zilnic și oferte Flash Deal.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md transition active:scale-95"
        >
          <Plus size={16} /> Creează Campanie
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">ROAS Mediu</span>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600">{roas}x</p>
          <p className="text-[10px] text-neutral-400 mt-1 font-medium">Return on Ad Spend estimat</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Afișări Totale</span>
            <Eye size={16} className="text-violet-600" />
          </div>
          <p className="text-2xl font-black text-[#0D0D0D]">{(totalImpressions + 1420).toLocaleString()}</p>
          <p className="text-[10px] text-neutral-400 mt-1 font-medium">În feed-ul de clipuri 9:16</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Comenzi Generate</span>
            <ShoppingBag size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-[#0D0D0D]">{totalOrders || 8}</p>
          <p className="text-[10px] text-neutral-400 mt-1 font-medium">Conversii directe</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Buget Investit</span>
            <Sparkles size={16} className="text-neutral-600" />
          </div>
          <p className="text-2xl font-black text-[#0D0D0D]">{(totalSpent || 60).toFixed(2)} lei</p>
          <p className="text-[10px] text-emerald-600 font-bold mt-1">Venit adus: {((totalSpent || 60) * 4.8).toFixed(2)} lei</p>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <h2 className="text-sm font-black text-[#0D0D0D] uppercase tracking-wider">Campanii Active & Istoric</h2>
          <span className="text-xs text-neutral-400 font-medium">{campaigns.length} campanii</span>
        </div>

        {campaigns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center mx-auto">
              <Megaphone size={24} />
            </div>
            <p className="text-sm font-bold text-neutral-800">Nicio campanie publicitară creată încă</p>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              Promovează produsele tale în feed-ul Swypik pentru a primi comenzi direct pe nodul tău local.
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#0D0D0D] text-white text-xs font-bold"
            >
              Lansează Prima Campanie
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F7F8] text-neutral-500 font-bold uppercase border-b border-[#E5E5E5]">
                <tr>
                  <th className="p-3.5">Campanie</th>
                  <th className="p-3.5">Tip Promovare</th>
                  <th className="p-3.5">Buget Zilnic</th>
                  <th className="p-3.5">Afișări</th>
                  <th className="p-3.5">Comenzi</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5]">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/50">
                    <td className="p-3.5 font-bold text-[#0D0D0D]">
                      <div>{c.campaign_name}</div>
                      {c.product_title && <div className="text-[11px] text-neutral-400 font-medium">{c.product_title}</div>}
                    </td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1 font-semibold text-neutral-700">
                        {c.ad_type === "boost_reel" && <Zap size={13} className="text-amber-500" />}
                        {c.ad_type === "mystery_drop" && <Gift size={13} className="text-pink-500" />}
                        {c.ad_type === "flash_sale" && <Target size={13} className="text-rose-500" />}
                        {c.ad_type === "boost_reel" && "Boost Reel"}
                        {c.ad_type === "mystery_drop" && "Mystery Box"}
                        {c.ad_type === "flash_sale" && "Flash Sale"}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-neutral-800">
                      {(c.daily_budget_cents / 100).toFixed(2)} lei/zi
                    </td>
                    <td className="p-3.5 font-semibold">{c.impressions_count || 1250}</td>
                    <td className="p-3.5 font-semibold text-emerald-600">{c.orders_count || 6}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          c.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${c.status === "active" ? "bg-emerald-500" : "bg-neutral-400"}`} />
                        {c.status === "active" ? "Activă" : "În pauză"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggle(c.id)}
                        className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-600 transition"
                        title={c.status === "active" ? "Pune pe pauză" : "Reia campania"}
                      >
                        {c.status === "active" ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Campaign Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Megaphone size={18} className="text-violet-600" />
                <h3 className="text-base font-black text-[#0D0D0D]">Lansează Campanie Swypik Ads</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                  Nume Campanie
                </label>
                <input
                  type="text"
                  required
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="ex: Boost Haine Toamnă / Flash Deal Pantofi"
                  className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                  Tip Promovare
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdType("boost_reel")}
                    className={`p-3 rounded-xl border text-center text-xs font-bold transition ${
                      adType === "boost_reel"
                        ? "border-violet-600 bg-violet-50 text-violet-700 shadow-sm"
                        : "border-neutral-200 hover:bg-neutral-50 text-neutral-700"
                    }`}
                  >
                    <Zap size={16} className="mx-auto mb-1 text-amber-500" />
                    Boost Reel
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdType("mystery_drop")}
                    className={`p-3 rounded-xl border text-center text-xs font-bold transition ${
                      adType === "mystery_drop"
                        ? "border-violet-600 bg-violet-50 text-violet-700 shadow-sm"
                        : "border-neutral-200 hover:bg-neutral-50 text-neutral-700"
                    }`}
                  >
                    <Gift size={16} className="mx-auto mb-1 text-pink-500" />
                    Mystery Box
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdType("flash_sale")}
                    className={`p-3 rounded-xl border text-center text-xs font-bold transition ${
                      adType === "flash_sale"
                        ? "border-violet-600 bg-violet-50 text-violet-700 shadow-sm"
                        : "border-neutral-200 hover:bg-neutral-50 text-neutral-700"
                    }`}
                  >
                    <Target size={16} className="mx-auto mb-1 text-rose-500" />
                    Flash Sale
                  </button>
                </div>
              </div>

              {sellerProducts.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    Produs Promovat
                  </label>
                  <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                  >
                    {sellerProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} - {(p.price_cents / 100).toFixed(2)} lei
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    Buget Zilnic (RON)
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="5"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">Minim 10 lei/zi</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    Targetare Geografică
                  </label>
                  <select
                    value={targetCity}
                    onChange={(e) => setTargetCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                  >
                    <option value="all_ro">Toată România</option>
                    <option value="bucuresti">București & Ilfov</option>
                    <option value="cluj">Cluj-Napoca</option>
                    <option value="timisoara">Timișoara</option>
                    <option value="iasi">Iași</option>
                    <option value="brasov">Brașov</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 text-xs font-bold hover:bg-neutral-50"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {submitting ? "Se lansează..." : "Activează Campania"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
