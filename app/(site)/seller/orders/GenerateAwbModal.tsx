"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { SellerOrder } from "./types";
import { X, Package, Truck, Box, Check, AlertCircle, Loader2 } from "lucide-react";

type Props = {
  order: SellerOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (awbNumber: string) => void;
};

const KNOWN_ERROR_CODES = new Set([
  "unauthorized",
  "not_found",
  "rate_limited",
  "invalid_status",
  "awb_number_required",
  "validation_error",
  "server_error",
  "feature_frozen",
]);

function translateError(code: string | undefined | null, t: (key: string) => string): string {
  if (code && KNOWN_ERROR_CODES.has(code)) return t(`errors.${code}`);
  return code || t("errors.server_error");
}

export default function GenerateAwbModal({ order, isOpen, onClose, onSuccess }: Props) {
  const t = useTranslations("sellerOrders");
  const [courier, setCourier] = useState<"sameday_easybox" | "sameday" | "fancourier" | "standard">("sameday_easybox");
  const [parcelsCount, setParcelsCount] = useState<number>(1);
  const [weightKg, setWeightKg] = useState<string>("1.0");
  const [notes, setNotes] = useState<string>("");
  const [lockerName, setLockerName] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      const method = (order.order_metadata.shipping_method || "").toLowerCase();
      const locker = order.order_metadata.easybox_locker || "";
      const address = (order.order_metadata.shipping_address?.line1 || "").toLowerCase();

      if (method.includes("easybox") || locker || address.includes("easybox")) {
        setCourier("sameday_easybox");
      } else if (method.includes("fan")) {
        setCourier("fancourier");
      } else if (method.includes("sameday")) {
        setCourier("sameday");
      } else {
        setCourier("sameday_easybox");
      }

      setLockerName(locker);
      setNotes("");
      setTrackingNumber("");
      setError(null);
    }
  }, [order]);

  if (!isOpen || !order) return null;

  const orderShortId = order.order_id.slice(0, 8).toUpperCase();
  const customerName = order.order_metadata.customer_name || order.order_metadata.shipping_address?.name || t("table.defaultCustomer");
  const customerPhone = order.order_metadata.customer_phone || order.order_metadata.shipping_address?.phone || "-";
  const shippingAddress = order.order_metadata.shipping_address;
  const addressFormatted = shippingAddress
    ? [shippingAddress.line1, shippingAddress.city, shippingAddress.state].filter(Boolean).join(", ")
    : t("awbModal.addressUnavailable");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const weightNum = parseFloat(weightKg) || 1.0;

    try {
      const res = await fetch(`/api/seller/orders/${order.order_id}/awb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courier,
          parcels_count: parcelsCount,
          weight_kg: weightNum,
          locker_name: courier === "sameday_easybox" ? lockerName : undefined,
          manual_tracking_number: trackingNumber.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(translateError(json.error, t));
      }

      onSuccess(json.awb?.awbNumber || t("awbModal.awbGeneratedFallback"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("awbModal.saveError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden my-8 max-h-[90dvh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <Package className="text-violet-600" size={20} />
              {t("awbModal.title", { id: orderShortId })}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {t("awbModal.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label={t("actions.close")}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Customer brief */}
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-bold text-neutral-900">{customerName}</span>
                <span className="text-neutral-500 ml-2 font-mono">{customerPhone}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-neutral-200/80 text-neutral-700 font-semibold text-[10px]">
                {t("awbModal.itemsCount", { count: order.items.length })}
              </span>
            </div>
            <p className="text-neutral-600 mt-1 truncate">{addressFormatted}</p>
          </div>

          {/* Courier selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-2">
              {t("awbModal.courierLabel")}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Sameday Easybox */}
              <button
                type="button"
                onClick={() => setCourier("sameday_easybox")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  courier === "sameday_easybox"
                    ? "border-violet-600 bg-violet-50/50 ring-2 ring-violet-500/20"
                    : "border-neutral-200 hover:border-neutral-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Box className={courier === "sameday_easybox" ? "text-violet-600" : "text-neutral-500"} size={20} />
                  {courier === "sameday_easybox" && <Check className="text-violet-600" size={16} />}
                </div>
                <div>
                  <p className="font-bold text-xs text-neutral-900">{t("courier.easybox")}</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">{t("awbModal.easyboxHint")}</p>
                </div>
              </button>

              {/* Fan Courier */}
              <button
                type="button"
                onClick={() => setCourier("fancourier")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  courier === "fancourier"
                    ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20"
                    : "border-neutral-200 hover:border-neutral-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Truck className={courier === "fancourier" ? "text-blue-600" : "text-neutral-500"} size={20} />
                  {courier === "fancourier" && <Check className="text-blue-600" size={16} />}
                </div>
                <div>
                  <p className="font-bold text-xs text-neutral-900">{t("courier.fan")}</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">{t("awbModal.fanHint")}</p>
                </div>
              </button>

              {/* Livrare Standard */}
              <button
                type="button"
                onClick={() => setCourier("standard")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  courier === "standard"
                    ? "border-neutral-900 bg-neutral-100 ring-2 ring-neutral-400/20"
                    : "border-neutral-200 hover:border-neutral-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Package className={courier === "standard" ? "text-neutral-900" : "text-neutral-500"} size={20} />
                  {courier === "standard" && <Check className="text-neutral-900" size={16} />}
                </div>
                <div>
                  <p className="font-bold text-xs text-neutral-900">{t("courier.standard")}</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">{t("awbModal.standardHint")}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Easybox Locker detail */}
          {courier === "sameday_easybox" && (
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                {t("awbModal.lockerLabel")}
              </label>
              <input
                type="text"
                value={lockerName}
                onChange={(e) => setLockerName(e.target.value)}
                placeholder={t("awbModal.lockerPlaceholder")}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 focus:outline-none transition"
              />
            </div>
          )}

          {/* Parcels and Weight */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                {t("awbModal.parcelsLabel")}
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={parcelsCount}
                onChange={(e) => setParcelsCount(parseInt(e.target.value) || 1)}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                {t("awbModal.weightLabel")}
              </label>
              <input
                type="text"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="1.0"
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Delivery Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              {t("awbModal.notesLabel")}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("awbModal.notesPlaceholder")}
              className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 focus:outline-none transition"
            />
          </div>

          {/* Numărul AWB emis de curier — obligatoriu. Swypik nu generează AWB-uri. */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1.5">
              {t("awbModal.awbNumberLabel")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder={t("awbModal.awbNumberPlaceholder")}
              className="w-full px-3.5 py-2.5 text-xs font-mono bg-white border border-neutral-300 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 focus:outline-none transition"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              {t("awbModal.awbNumberHint")}
            </p>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#0D0D0D] hover:bg-black rounded-xl shadow-md transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t("awbModal.generating")}
                </>
              ) : (
                <>
                  <Package size={14} />
                  {t("actions.generateAwb")}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
