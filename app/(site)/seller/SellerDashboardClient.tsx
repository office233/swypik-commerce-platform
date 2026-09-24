"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { isEnabledClient } from "@/lib/feature-flags-client";
import { formatMoneyCents } from "@/lib/i18n/currency";
import { logger } from "@/lib/logger";
import SelenaAssistant from "./SelenaAssistant";

type RecentOrder = {
  orderId: string;
  totalCents: number;
  createdAt: string;
  status: string;
  statusLabel: string;
  trackingNumber?: string | null;
  items?: Array<{ title: string; quantity: number }>;
};

type DashboardData = {
  totalSalesLei: number;
  pendingOrders: number;
  activeProducts: number;
  stripeConnected: boolean;
  recentOrders: RecentOrder[];
};

const emptyDashboard: DashboardData = {
  totalSalesLei: 0,
  pendingOrders: 0,
  activeProducts: 0,
  stripeConnected: true,
  recentOrders: [],
};

const formatLeiFromCents = (cents: number) => formatMoneyCents(Number(cents || 0), "RON");

export default function SellerDashboardPage() {
  const t = useTranslations("sellerGrowthDashboard");
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/seller/dashboard");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || t("loadError"));
      }
      setData({
        totalSalesLei: Number(json.totalSalesLei || 0),
        pendingOrders: Number(json.pendingOrders || 0),
        activeProducts: Number(json.activeProducts || 0),
        stripeConnected: json.stripeConnected !== false,
        recentOrders: Array.isArray(json.recentOrders) ? json.recentOrders : [],
      });
    } catch (err: any) {
      logger.error({ err }, "Failed to fetch seller dashboard data");
      setError(err.message || t("loadError"));
      setData(emptyDashboard);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleConnectStripe = async () => {
    try {
      setConnecting(true);
      const res = await fetch("/api/seller/stripe-connect", {
        method: "POST",
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result?.error || "stripe_connect_failed");
      }
      if (result.url) {
        window.location.href = result.url;
      } else {
        setError(t("stripeConnectError"));
        setConnecting(false);
      }
    } catch (e) {
      logger.error({ err: e }, "Failed to connect Stripe account");
      setError(t("stripeConnectError"));
      setConnecting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0D0D0D]">{t("title")}</h1>
          <p className="text-sm text-[#6E6E80] mt-1">{t("subtitle")}</p>
        </div>
        <button
          onClick={fetchDashboard}
          disabled={loading}
          className="rounded-lg border border-[#E5E5E5] bg-white px-4 py-2.5 min-h-[40px] text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
        >
          {loading ? t("loading") : t("reload")}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-700">{error}</p>
          <button onClick={fetchDashboard} className="mt-3 inline-flex items-center min-h-[36px] px-2 text-sm font-bold text-red-700 underline focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none rounded">
            {t("retry")}
          </button>
        </div>
      )}

      <SelenaAssistant />

      {isEnabledClient('stripeConnect') && !loading && !error && !data.stripeConnected && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8 rounded-r-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-yellow-800 font-bold">{t("stripeNotValidated")}</h3>
            <p className="text-yellow-700 text-sm mt-1">
              {t("stripeConnectPrompt")}
            </p>
          </div>
          <button
            onClick={handleConnectStripe}
            disabled={connecting}
            className="whitespace-nowrap bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold py-3 px-5 min-h-[44px] rounded-lg transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-yellow-600 focus-visible:outline-none"
          >
            {connecting ? t("connecting") : t("connectStripe")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 shadow-sm">
          <h3 className="text-xs font-bold text-[#6E6E80] uppercase tracking-widest">{t("totalSales")}</h3>
          <p className="text-3xl font-black text-[#0D0D0D] mt-4">
            {loading ? "..." : `${data.totalSalesLei} lei`}
          </p>
          <p className="text-xs font-bold text-[#6E6E80] mt-2">{t("totalSalesHint")}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 shadow-sm">
          <h3 className="text-xs font-bold text-[#6E6E80] uppercase tracking-widest">{t("pendingOrders")}</h3>
          <p className="text-3xl font-black text-[#0D0D0D] mt-4">
            {loading ? "..." : data.pendingOrders}
          </p>
          <p className="text-xs font-bold text-[#df1b41] mt-2">{t("pendingOrdersHint")}</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 shadow-sm">
          <h3 className="text-xs font-bold text-[#6E6E80] uppercase tracking-widest">{t("activeProducts")}</h3>
          <p className="text-3xl font-black text-[#0D0D0D] mt-4">
            {loading ? "..." : data.activeProducts}
          </p>
          <p className="text-xs font-bold text-[#6E6E80] mt-2">{t("activeProductsHint")}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-[#0D0D0D]">{t("recentOrders")}</h2>
          <Link href="/seller/orders" className="text-sm font-bold text-[#0D0D0D] hover:underline">
            {t("seeAll")}
          </Link>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm font-bold text-[#6E6E80]">{t("loadingOrders")}</div>
        ) : data.recentOrders.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-bold text-[#0D0D0D]">{t("noOrdersYet")}</p>
            <p className="text-sm text-[#6E6E80] mt-1">{t("noOrdersHint")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E5E5]">
            {data.recentOrders.map((order) => (
              <div key={order.orderId} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-xs font-bold text-[#6E6E80]">#{order.orderId.split("-")[0]}</p>
                  <p className="mt-1 text-sm font-bold text-[#0D0D0D] break-words">
                    {order.items?.slice(0, 2).map((item) => `${item.quantity}x ${item.title}`).join(", ") || t("order")}
                  </p>
                  {order.trackingNumber && (
                    <p className="mt-1 text-xs text-[#6E6E80]">AWB: <span className="font-mono">{order.trackingNumber}</span></p>
                  )}
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className="rounded-full bg-[#F7F7F8] px-3 py-1 text-xs font-bold text-[#0D0D0D]">
                    {order.statusLabel}
                  </span>
                  <span className="text-sm font-black text-[#0D0D0D]">{formatLeiFromCents(order.totalCents)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
