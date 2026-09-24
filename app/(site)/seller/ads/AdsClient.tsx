"use client";

import React, { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { apiErrorMessage } from "@/lib/i18n/api-error";
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  TrendingUp,
  Eye,
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
  const t = useTranslations("sellerGrowthAds");
  const locale = useLocale();
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [campaignName, setCampaignName] = useState("");
  const [adType, setAdType] = useState<"boost_reel" | "mystery_drop" | "flash_sale">("boost_reel");
  const [selectedProduct, setSelectedProduct] = useState(sellerProducts[0]?.id || "");
  const [dailyBudget, setDailyBudget] = useState("30");
  const [targetCity, setTargetCity] = useState("all_ro");

  // Summary Metrics (real data only — no placeholder/demo padding)
  const totalSpent = campaigns.reduce((acc, c) => acc + (Number(c.spent_budget_cents) || 0), 0) / 100;
  const totalRevenue = campaigns.reduce((acc, c) => acc + (Number(c.revenue_cents) || 0), 0) / 100;
  const totalImpressions = campaigns.reduce((acc, c) => acc + (Number(c.impressions_count) || 0), 0);
  const totalOrders = campaigns.reduce((acc, c) => acc + (Number(c.orders_count) || 0), 0);
  const roas = totalSpent > 0 ? (totalRevenue / totalSpent).toFixed(2) : "0.00";

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
      alert(t("errorToggle"));
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
        alert(apiErrorMessage(data, locale, t("errorCreate")));
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
      alert(t("errorNetwork"));
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
            <h1 className="text-2xl font-black text-[#0D0D0D] tracking-tight">{t("pageTitle")}</h1>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
              {t("aiPowered")}
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-medium mt-0.5">
            {t("pageSubtitle")}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md transition active:scale-95"
        >
          <Plus size={16} /> {t("createCampaign")}
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("avgRoas")}</span>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600">{roas}x</p>
          <p className="text-[10px] text-neutral-400 mt-1 font-medium">{t("roasHint")}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("totalImpressions")}</span>
            <Eye size={16} className="text-violet-600" />
          </div>
          <p className="text-2xl font-black text-[#0D0D0D]">{totalImpressions.toLocaleString()}</p>
          <p className="text-[10px] text-neutral-400 mt-1 font-medium">{t("impressionsHint")}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("ordersGenerated")}</span>
            <ShoppingBag size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-black text-[#0D0D0D]">{totalOrders}</p>
          <p className="text-[10px] text-neutral-400 mt-1 font-medium">{t("directConversions")}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("budgetSpent")}</span>
            <Sparkles size={16} className="text-neutral-600" />
          </div>
          <p className="text-2xl font-black text-[#0D0D0D]">{totalSpent.toFixed(2)} lei</p>
          <p className="text-[10px] text-emerald-600 font-bold mt-1">{t("revenueGenerated")}: {totalRevenue.toFixed(2)} lei</p>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between">
          <h2 className="text-sm font-black text-[#0D0D0D] uppercase tracking-wider">{t("campaignsHistory")}</h2>
          <span className="text-xs text-neutral-400 font-medium">{t("campaignCount", { count: campaigns.length })}</span>
        </div>

        {campaigns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center mx-auto">
              <Megaphone size={24} />
            </div>
            <p className="text-sm font-bold text-neutral-800">{t("emptyTitle")}</p>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              {t("emptySubtitle")}
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#0D0D0D] text-white text-xs font-bold"
            >
              {t("launchFirstCampaign")}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F7F8] text-neutral-500 font-bold uppercase border-b border-[#E5E5E5]">
                <tr>
                  <th className="p-3.5">{t("colCampaign")}</th>
                  <th className="p-3.5">{t("colType")}</th>
                  <th className="p-3.5">{t("colDailyBudget")}</th>
                  <th className="p-3.5">{t("colImpressions")}</th>
                  <th className="p-3.5">{t("colOrders")}</th>
                  <th className="p-3.5">{t("colStatus")}</th>
                  <th className="p-3.5 text-right">{t("colActions")}</th>
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
                        {c.ad_type === "boost_reel" && t("typeBoostReel")}
                        {c.ad_type === "mystery_drop" && t("typeMysteryBox")}
                        {c.ad_type === "flash_sale" && t("typeFlashSale")}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-neutral-800">
                      {t("perDay", { amount: (c.daily_budget_cents / 100).toFixed(2) })}
                    </td>
                    <td className="p-3.5 font-semibold">{c.impressions_count || 0}</td>
                    <td className="p-3.5 font-semibold text-emerald-600">{c.orders_count || 0}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          c.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${c.status === "active" ? "bg-emerald-500" : "bg-neutral-400"}`} />
                        {c.status === "active" ? t("statusActive") : t("statusPaused")}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggle(c.id)}
                        className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-600 transition min-w-[36px] min-h-[36px]"
                        title={c.status === "active" ? t("pauseAction") : t("resumeAction")}
                        aria-label={c.status === "active" ? t("pauseAction") : t("resumeAction")}
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
                <h3 className="text-base font-black text-[#0D0D0D]">{t("modalTitle")}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-bold w-8 h-8 flex items-center justify-center"
                aria-label={t("close")}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                  {t("campaignNameLabel")}
                </label>
                <input
                  type="text"
                  required
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder={t("campaignNamePlaceholder")}
                  className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                  {t("promoTypeLabel")}
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
                    {t("typeBoostReel")}
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
                    {t("typeMysteryBox")}
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
                    {t("typeFlashSale")}
                  </button>
                </div>
              </div>

              {sellerProducts.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    {t("promotedProductLabel")}
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
                    {t("dailyBudgetLabel")}
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="5"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">{t("minPerDay")}</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1">
                    {t("geoTargetLabel")}
                  </label>
                  <select
                    value={targetCity}
                    onChange={(e) => setTargetCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                  >
                    <option value="all_ro">{t("cityAllRo")}</option>
                    <option value="bucuresti">{t("cityBucuresti")}</option>
                    <option value="cluj">{t("cityCluj")}</option>
                    <option value="timisoara">{t("cityTimisoara")}</option>
                    <option value="iasi">{t("cityIasi")}</option>
                    <option value="brasov">{t("cityBrasov")}</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-200 text-xs font-bold hover:bg-neutral-50"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {submitting ? t("launching") : t("activateCampaign")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
