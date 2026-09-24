"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useTranslations, useLocale } from "next-intl";
import {
  Package,
  RefreshCw,
  Banknote,
  Hourglass,
  ShoppingBag,
  Truck,
  Box,
  Printer,
  Search,
  ExternalLink,
  Eye,
  CheckCircle2,
  RotateCcw,
  X,
} from "lucide-react";
import { SellerOrder } from "./types";
import GenerateAwbModal from "./GenerateAwbModal";
import PrintAwbModal from "./PrintAwbModal";
import OrderDetailsModal from "./OrderDetailsModal";

const KNOWN_ERROR_CODES = new Set([
  "unauthorized",
  "not_found",
  "rate_limited",
  "invalid_status",
  "already_refunded",
  "order_not_owned",
  "multi_seller_requires_admin",
  "missing_payment_intent",
  "stripe_refund_failed",
  "awb_number_required",
  "validation_error",
  "server_error",
  "feature_frozen",
]);

/** Traduce un cod de eroare stabil venit din API; dacă e text brut (ex.
 * mesajul Stripe deja sigur pentru afișare), îl arată direct. */
function translateError(code: string | undefined | null, t: (key: string) => string): string {
  if (code && KNOWN_ERROR_CODES.has(code)) return t(`errors.${code}`);
  return code || t("errors.server_error");
}

export default function SellerOrdersPage() {
  const t = useTranslations("sellerOrders");
  const locale = useLocale();

  const fetcher = async (url: string) => {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(translateError(json.error, t));
    }
    return json;
  };

  const { data, error, mutate, isValidating } = useSWR("/api/seller/orders", fetcher);

  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "RON" }),
    [locale]
  );
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    [locale]
  );

  /* ───────────────────────────── Status Badge ───────────────────────────── */
  function StatusBadge({ status, label }: { status: string; label?: string }) {
    switch (status) {
      case "fulfilled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 size={13} />
            {label || t("status.fulfilled")}
          </span>
        );
      case "return_requested":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 ring-2 ring-orange-300">
            <RotateCcw size={13} />
            {label || t("status.returnRequested")}
          </span>
        );
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
            <Banknote size={13} />
            {label || t("status.refunded")}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Hourglass size={13} />
            {label || t("status.pending")}
          </span>
        );
    }
  }

  /* ───────────────────────────── Courier Badge ───────────────────────────── */
  function CourierBadge({ method, awbNumber }: { method?: string | null; awbNumber?: string | null }) {
    const m = (method || "").toLowerCase();
    let badgeStyle = "bg-neutral-100 text-neutral-800 border-neutral-200";
    let icon = <Package size={13} />;
    let label = method || t("courier.standard");

    if (m.includes("easybox") || m.includes("sameday")) {
      badgeStyle = "bg-violet-100 text-violet-800 border-violet-200";
      icon = <Box size={13} />;
      label = m.includes("easybox") ? t("courier.easybox") : t("courier.samedayCourier");
    } else if (m.includes("fan")) {
      badgeStyle = "bg-blue-100 text-blue-800 border-blue-200";
      icon = <Truck size={13} />;
      label = t("courier.fan");
    }

    return (
      <div className="flex flex-col gap-1">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badgeStyle} w-fit`}>
          {icon}
          <span>{label}</span>
        </span>
        {awbNumber && (
          <span className="font-mono text-[11px] text-neutral-600 font-medium">
            {t("table.awbShort")}: <span className="font-bold text-neutral-900">{awbNumber}</span>
          </span>
        )}
      </div>
    );
  }

  // Modals state
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<SellerOrder | null>(null);
  const [selectedOrderForAwb, setSelectedOrderForAwb] = useState<SellerOrder | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<SellerOrder | null>(null);
  const [loadingRefund, setLoadingRefund] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "fulfilled" | "returns">("all");
  const [courierFilter, setCourierFilter] = useState<string>("all");

  const rawOrders: SellerOrder[] = useMemo(() => data?.orders || [], [data]);
  const isLoading = !data && !error;

  /* ────── Stats calculation ────── */
  const stats = useMemo(() => {
    let totalCents = 0;
    let pendingAwbCount = 0;
    let fulfilledCount = 0;
    let returnsCount = 0;

    rawOrders.forEach((o) => {
      totalCents += o.total_cents;
      const hasAwb = Boolean(
        o.order_metadata?.awb_details?.awb_number || o.order_metadata?.tracking_number
      );
      if (o.status === "return_requested" || o.status === "refunded") {
        returnsCount++;
      } else if (hasAwb || o.status === "fulfilled") {
        fulfilledCount++;
      } else {
        pendingAwbCount++;
      }
    });

    return {
      totalOrders: rawOrders.length,
      pendingAwbCount,
      fulfilledCount,
      returnsCount,
      totalCents,
    };
  }, [rawOrders]);

  /* ────── Filtered orders ────── */
  const filteredOrders = useMemo(() => {
    return rawOrders.filter((order) => {
      const shortId = order.order_id.slice(0, 8).toLowerCase();
      const clientName = (order.order_metadata?.customer_name || order.order_metadata?.shipping_address?.name || "").toLowerCase();
      const clientPhone = (order.order_metadata?.customer_phone || order.order_metadata?.shipping_address?.phone || "").toLowerCase();
      const awbCode = (order.order_metadata?.awb_details?.awb_number || order.order_metadata?.tracking_number || "").toLowerCase();
      const itemsMatch = order.items.some((i) => i.title.toLowerCase().includes(searchQuery.toLowerCase()));

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        shortId.includes(q) ||
        clientName.includes(q) ||
        clientPhone.includes(q) ||
        awbCode.includes(q) ||
        itemsMatch;

      if (!matchesSearch) return false;

      // Status filter
      const hasAwb = Boolean(
        order.order_metadata?.awb_details?.awb_number || order.order_metadata?.tracking_number
      );
      if (statusFilter === "pending") {
        if (hasAwb || order.status === "fulfilled" || order.status === "return_requested" || order.status === "refunded") {
          return false;
        }
      } else if (statusFilter === "fulfilled") {
        if (!hasAwb && order.status !== "fulfilled") return false;
      } else if (statusFilter === "returns") {
        if (order.status !== "return_requested" && order.status !== "refunded") return false;
      }

      // Courier filter
      if (courierFilter !== "all") {
        const method = (order.order_metadata?.shipping_method || "").toLowerCase();
        if (courierFilter === "easybox" && !method.includes("easybox")) return false;
        if (courierFilter === "fan" && !method.includes("fan")) return false;
        if (courierFilter === "standard" && (method.includes("easybox") || method.includes("fan"))) return false;
      }

      return true;
    });
  }, [rawOrders, searchQuery, statusFilter, courierFilter]);

  /* ────── AWB Success handler ────── */
  const handleAwbSuccess = (awbNumber: string) => {
    setSuccessToast(t("toast.awbSuccess", { awb: awbNumber }));
    mutate();
    setTimeout(() => setSuccessToast(null), 5000);
  };

  /* ────── Refund handler ────── */
  const handleRefund = async (orderId: string) => {
    const confirmed = confirm(t("actions.confirmRefund"));
    if (!confirmed) return;

    setLoadingRefund(orderId);
    try {
      const res = await fetch(`/api/seller/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        alert(t("actions.refundSuccess"));
        mutate();
      } else {
        alert(t("actions.refundError", { msg: translateError(json.error, t) }));
      }
    } catch (err) {
      alert(t("actions.refundGenericError"));
    } finally {
      setLoadingRefund(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 pb-[max(32px,env(safe-area-inset-bottom))]">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            aria-label={t("actions.closeToast")}
            className="ml-2 text-emerald-300 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-[#0D0D0D]">{t("header.title")}</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800">
              {t("header.badgeErp")}
            </span>
          </div>
          <p className="text-sm text-[#6E6E80] mt-1">{t("header.subtitle")}</p>
        </div>

        <button
          type="button"
          onClick={() => mutate()}
          disabled={isValidating}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-xl transition shadow-sm w-fit"
        >
          <RefreshCw size={14} className={isValidating ? "animate-spin text-violet-600" : ""} />
          {t("header.refresh")}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {/* Total Orders */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-[#6E6E80] mb-2">
            <span className="text-xs font-semibold">{t("kpi.totalOrders")}</span>
            <ShoppingBag size={18} className="text-neutral-500" />
          </div>
          <div className="text-2xl font-black text-[#0D0D0D] font-mono">
            {stats.totalOrders}
          </div>
          <div className="text-[11px] text-[#6E6E80] mt-1">{t("kpi.totalOrdersHint")}</div>
        </div>

        {/* Pending AWB */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/40 shadow-sm">
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-xs font-bold">{t("kpi.pendingAwb")}</span>
            <Package size={18} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900 font-mono">
            {stats.pendingAwbCount}
          </div>
          <div className="text-[11px] text-amber-700 mt-1 font-medium">
            {t("kpi.pendingAwbHint")}
          </div>
        </div>

        {/* Shipped */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-xs font-semibold">{t("kpi.shipped")}</span>
            <Truck size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-neutral-900 font-mono">
            {stats.fulfilledCount}
          </div>
          <div className="text-[11px] text-[#6E6E80] mt-1">{t("kpi.shippedHint")}</div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center justify-between text-[#6E6E80] mb-2">
            <span className="text-xs font-semibold">{t("kpi.revenue")}</span>
            <Banknote size={18} className="text-neutral-500" />
          </div>
          <div className="text-2xl font-black text-[#0D0D0D] font-mono">
            {currency.format(stats.totalCents / 100)}
          </div>
          <div className="text-[11px] text-[#6E6E80] mt-1">{t("kpi.revenueHint")}</div>
        </div>
      </div>

      {/* Toolbar: Search and Filters */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm p-4 mb-5 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("toolbar.searchPlaceholder")}
              aria-label={t("toolbar.searchPlaceholder")}
              className="w-full pl-10 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-200 focus:outline-none transition"
            />
          </div>

          {/* Courier filter dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-neutral-500 hidden sm:inline">{t("toolbar.courierLabel")}</span>
            <label className="sr-only" htmlFor="seller-orders-courier-filter">
              {t("toolbar.courierLabel")}
            </label>
            <select
              id="seller-orders-courier-filter"
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-none cursor-pointer"
            >
              <option value="all">{t("toolbar.courierAll")}</option>
              <option value="easybox">{t("courier.easybox")}</option>
              <option value="fan">{t("courier.fan")}</option>
              <option value="standard">{t("courier.standard")}</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-neutral-100">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              statusFilter === "all"
                ? "bg-[#0D0D0D] text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {t("toolbar.tabAll", { count: rawOrders.length })}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              statusFilter === "pending"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-700 hover:bg-amber-50"
            }`}
          >
            {t("toolbar.tabPending", { count: stats.pendingAwbCount })}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("fulfilled")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              statusFilter === "fulfilled"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            {t("toolbar.tabFulfilled", { count: stats.fulfilledCount })}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("returns")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              statusFilter === "returns"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-orange-700 hover:bg-orange-50"
            }`}
          >
            {t("toolbar.tabReturns", { count: stats.returnsCount })}
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F7F7F8] border-b border-[#E5E5E5]">
              <tr>
                <th className="px-5 py-3.5 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">
                  {t("table.colOrder")}
                </th>
                <th className="px-5 py-3.5 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">
                  {t("table.colBuyer")}
                </th>
                <th className="px-5 py-3.5 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">
                  {t("table.colProducts")}
                </th>
                <th className="px-5 py-3.5 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">
                  {t("table.colShipping")}
                </th>
                <th className="px-5 py-3.5 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px]">
                  {t("table.colStatus")}
                </th>
                <th className="px-5 py-3.5 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px] text-right">
                  {t("table.colTotal")}
                </th>
                <th className="px-5 py-3.5 font-bold text-[#6E6E80] uppercase tracking-widest text-[10px] text-right">
                  {t("table.colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-[#6E6E80]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw size={24} className="animate-spin text-violet-600" />
                      <span className="text-xs font-semibold">{t("table.loading")}</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <p className="font-bold text-red-700">{t("table.errorTitle")}</p>
                    <p className="text-sm text-[#6E6E80] mt-1">{error.message || t("errors.server_error")}</p>
                    <button
                      type="button"
                      onClick={() => mutate()}
                      className="mt-4 inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-[#0D0D0D] rounded-xl hover:bg-black"
                    >
                      {t("table.retry")}
                    </button>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-400 mb-3">
                        <ShoppingBag size={24} />
                      </div>
                      <p className="font-bold text-[#0D0D0D] text-sm">
                        {rawOrders.length === 0 ? t("table.emptyTitleNone") : t("table.emptyTitleFiltered")}
                      </p>
                      <p className="text-xs text-[#6E6E80] mt-1">
                        {rawOrders.length === 0 ? t("table.emptyHintNone") : t("table.emptyHintFiltered")}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const shortId = order.order_id.slice(0, 8).toUpperCase();
                  const customerName =
                    order.order_metadata?.customer_name ||
                    order.order_metadata?.shipping_address?.name ||
                    t("table.defaultCustomer");
                  const customerPhone =
                    order.order_metadata?.customer_phone ||
                    order.order_metadata?.shipping_address?.phone ||
                    "-";
                  const customerCity =
                    order.order_metadata?.shipping_address?.city || "";

                  const awbNumber =
                    order.order_metadata?.awb_details?.awb_number ||
                    order.order_metadata?.tracking_number ||
                    null;

                  const trackingUrl =
                    order.order_metadata?.awb_details?.tracking_url ||
                    order.order_metadata?.tracking_url ||
                    null;

                  const isReturnRequested = order.status === "return_requested";
                  const isRefunded = order.status === "refunded";
                  const isFulfilled = order.status === "fulfilled" || Boolean(awbNumber);

                  const formattedOrderDate = dateTimeFormat.format(new Date(order.created_at));

                  return (
                    <tr
                      key={order.order_id}
                      className={`hover:bg-neutral-50/70 transition-colors ${
                        isReturnRequested ? "bg-orange-50/40" : isRefunded ? "bg-purple-50/30" : ""
                      }`}
                    >
                      {/* ID Comandă & Dată */}
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedOrderDetails(order)}
                          className="font-mono text-xs font-bold text-neutral-900 hover:text-violet-600 transition flex items-center gap-1 text-left"
                        >
                          #SWY-{shortId}
                        </button>
                        <span className="text-[11px] text-neutral-500 block mt-0.5">
                          {formattedOrderDate}
                        </span>
                      </td>

                      {/* Cumpărător */}
                      <td className="px-5 py-4">
                        <div className="text-xs font-bold text-neutral-900">{customerName}</div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          {customerPhone}
                          {customerCity && ` • ${customerCity}`}
                        </div>
                      </td>

                      {/* Produse Comandate */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          {order.items.map((it) => (
                            <div key={it.item_id} className="text-xs text-neutral-800 leading-tight">
                              <span className="font-bold text-neutral-900">{it.quantity}x</span>{" "}
                              <span className="truncate max-w-[200px] inline-block align-bottom">{it.title}</span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Metodă Livrare & AWB */}
                      <td className="px-5 py-4">
                        <CourierBadge
                          method={
                            order.order_metadata?.awb_details?.carrier ||
                            order.order_metadata?.tracking_carrier ||
                            order.order_metadata?.shipping_method
                          }
                          awbNumber={awbNumber}
                        />
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={order.status} label={order.status_label} />
                      </td>

                      {/* Total */}
                      <td className="px-5 py-4 text-right font-mono font-bold text-neutral-900 text-xs">
                        {currency.format(order.total_cents / 100)}
                      </td>

                      {/* Acțiuni */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Buton Detalii Comandă */}
                          <button
                            type="button"
                            onClick={() => setSelectedOrderDetails(order)}
                            aria-label={t("actions.viewDetails")}
                            title={t("actions.viewDetails")}
                            className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Buton Generează AWB (dacă nu are AWB și nu e retur/refunded) */}
                          {!awbNumber && !isFulfilled && !isReturnRequested && !isRefunded && (
                            <button
                              type="button"
                              onClick={() => setSelectedOrderForAwb(order)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-sm transition"
                            >
                              <Package size={13} />
                              {t("actions.generateAwb")}
                            </button>
                          )}

                          {/* Buton Tipărește AWB (dacă are AWB) */}
                          {awbNumber && (
                            <button
                              type="button"
                              onClick={() => setSelectedOrderForPrint(order)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition"
                              title={t("actions.printAwb")}
                            >
                              <Printer size={13} />
                              {t("actions.printAwb")}
                            </button>
                          )}

                          {/* Link Urmărește Colet */}
                          {trackingUrl && (
                            <a
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-neutral-400 hover:text-neutral-800 rounded-lg transition"
                              aria-label={t("actions.trackParcel")}
                              title={t("actions.trackParcel")}
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}

                          {/* Aprobă retur */}
                          {isReturnRequested && (
                            <button
                              type="button"
                              onClick={() => handleRefund(order.order_id)}
                              disabled={loadingRefund === order.order_id}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-lg hover:from-orange-600 hover:to-red-600 shadow-sm transition disabled:opacity-50"
                            >
                              {loadingRefund === order.order_id ? t("actions.approveReturnLoading") : t("actions.approveReturn")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal
        order={selectedOrderDetails}
        isOpen={Boolean(selectedOrderDetails)}
        onClose={() => setSelectedOrderDetails(null)}
        onGenerateAwb={(o) => {
          setSelectedOrderDetails(null);
          setSelectedOrderForAwb(o);
        }}
        onPrintAwb={(o) => {
          setSelectedOrderDetails(null);
          setSelectedOrderForPrint(o);
        }}
        onRefund={handleRefund}
      />

      {/* Generate AWB Modal */}
      <GenerateAwbModal
        order={selectedOrderForAwb}
        isOpen={Boolean(selectedOrderForAwb)}
        onClose={() => setSelectedOrderForAwb(null)}
        onSuccess={(awbNumber) => {
          handleAwbSuccess(awbNumber);
          if (selectedOrderForAwb) {
            // Prompt/offer to print immediately
            setSelectedOrderForPrint(selectedOrderForAwb);
          }
        }}
      />

      {/* Print AWB Modal */}
      <PrintAwbModal
        order={selectedOrderForPrint}
        isOpen={Boolean(selectedOrderForPrint)}
        onClose={() => setSelectedOrderForPrint(null)}
      />
    </div>
  );
}
