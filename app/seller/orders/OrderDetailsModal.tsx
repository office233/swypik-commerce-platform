"use client";

import { SellerOrder } from "./types";
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Truck,
  Box,
  Package,
  Calendar,
  ExternalLink,
  Printer,
  Copy,
  Check,
  CreditCard,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";

type Props = {
  order: SellerOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onGenerateAwb: (order: SellerOrder) => void;
  onPrintAwb: (order: SellerOrder) => void;
  onRefund?: (orderId: string) => void;
};

export default function OrderDetailsModal({
  order,
  isOpen,
  onClose,
  onGenerateAwb,
  onPrintAwb,
  onRefund,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !order) return null;

  const shortId = order.order_id.slice(0, 8).toUpperCase();
  const customerName = order.order_metadata.customer_name || order.order_metadata.shipping_address?.name || "Client Swypik";
  const customerPhone = order.order_metadata.customer_phone || order.order_metadata.shipping_address?.phone || "-";
  const customerEmail = order.order_metadata.customer_email || "-";
  const shippingAddress = order.order_metadata.shipping_address;

  const awbNumber =
    order.order_metadata.awb_details?.awb_number ||
    order.order_metadata.tracking_number ||
    null;

  const trackingUrl =
    order.order_metadata.awb_details?.tracking_url ||
    order.order_metadata.tracking_url ||
    null;

  const deliveryMethod =
    order.order_metadata.awb_details?.carrier ||
    order.order_metadata.tracking_carrier ||
    order.order_metadata.shipping_method ||
    "Livrare Standard";

  const easyboxLocker =
    order.order_metadata.awb_details?.locker_name ||
    order.order_metadata.easybox_locker ||
    null;

  const isReturnRequested = order.status === "return_requested";
  const isRefunded = order.status === "refunded";

  const handleCopyAwb = () => {
    if (awbNumber) {
      navigator.clipboard.writeText(awbNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formattedDate = new Date(order.created_at).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/70 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-neutral-900">
                Comanda #SWY-{shortId}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  order.status === "fulfilled"
                    ? "bg-emerald-100 text-emerald-800"
                    : isReturnRequested
                    ? "bg-orange-100 text-orange-800 ring-1 ring-orange-300"
                    : isRefunded
                    ? "bg-purple-100 text-purple-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {order.status === "fulfilled"
                  ? "Expediat"
                  : isReturnRequested
                  ? "Retur solicitat"
                  : isRefunded
                  ? "Restituit"
                  : "În procesare"}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
              <Calendar size={13} />
              Plasată pe {formattedDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Customer & Shipping info cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client */}
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500 pb-1 border-b border-neutral-200/60">
                <User size={14} className="text-neutral-700" />
                Date Cumpărător
              </div>
              <p className="font-bold text-neutral-900 text-sm">{customerName}</p>
              <div className="space-y-1.5 text-xs text-neutral-600">
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-neutral-400" />
                  {customerPhone !== "-" ? (
                    <a href={`tel:${customerPhone}`} className="hover:text-violet-600 font-mono">
                      {customerPhone}
                    </a>
                  ) : (
                    <span>Fără telefon</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-neutral-400" />
                  {customerEmail !== "-" ? (
                    <a href={`mailto:${customerEmail}`} className="hover:text-violet-600">
                      {customerEmail}
                    </a>
                  ) : (
                    <span>Fără email</span>
                  )}
                </div>
              </div>
            </div>

            {/* Delivery address */}
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500 pb-1 border-b border-neutral-200/60">
                <MapPin size={14} className="text-neutral-700" />
                Adresă Livrare & Curier
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800 mb-1.5">
                  {deliveryMethod.toLowerCase().includes("easybox") ? (
                    <Box size={13} />
                  ) : deliveryMethod.toLowerCase().includes("fan") ? (
                    <Truck size={13} />
                  ) : (
                    <Package size={13} />
                  )}
                  {deliveryMethod}
                </span>
                {easyboxLocker && (
                  <p className="text-xs font-bold text-violet-900">
                    Locker: {easyboxLocker}
                  </p>
                )}
                {shippingAddress ? (
                  <div className="text-xs text-neutral-700 space-y-0.5 mt-1">
                    <p className="font-medium">{shippingAddress.line1}</p>
                    {shippingAddress.line2 && <p>{shippingAddress.line2}</p>}
                    <p>
                      {shippingAddress.city}
                      {shippingAddress.state ? `, ${shippingAddress.state}` : ""}
                      {shippingAddress.postal_code ? ` - CP ${shippingAddress.postal_code}` : ""}
                    </p>
                    <p className="text-neutral-500">{shippingAddress.country || "România"}</p>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 italic mt-1">Nu există adresă înregistrată.</p>
                )}
              </div>
            </div>
          </div>

          {/* AWB Section */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Package className="text-violet-600" size={17} />
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                  Status Expediere & AWB
                </span>
              </div>
              {awbNumber && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  AWB Generat
                </span>
              )}
            </div>

            {awbNumber ? (
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/70">
                <div>
                  <div className="text-xs text-neutral-500">Cod AWB ({deliveryMethod}):</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-base font-black text-neutral-900">
                      {awbNumber}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAwb}
                      className="p-1 text-neutral-400 hover:text-neutral-700 rounded transition"
                      title="Copiază AWB"
                    >
                      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPrintAwb(order)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#0D0D0D] hover:bg-black rounded-xl shadow-sm transition"
                  >
                    <Printer size={14} />
                    Tipărește AWB
                  </button>
                  {trackingUrl && (
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-xl transition"
                    >
                      <ExternalLink size={13} />
                      Urmărește
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 p-4 bg-amber-50/60 rounded-xl border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-xs text-amber-900">Comanda necesită generare AWB</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Generează eticheta de transport pentru a expedia coletul către cumpărător.
                  </p>
                </div>
                {!isReturnRequested && !isRefunded && (
                  <button
                    type="button"
                    onClick={() => onGenerateAwb(order)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow transition shrink-0"
                  >
                    <Package size={14} />
                    Generează AWB
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Return Reason alert if requested */}
          {isReturnRequested && order.order_metadata.return_reason && (
            <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
              <p className="text-xs font-bold text-orange-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <RotateCcw size={14} />
                Motiv solicitare retur
              </p>
              <p className="text-xs text-orange-800 italic">
                &ldquo;{order.order_metadata.return_reason}&rdquo;
              </p>
              {onRefund && (
                <button
                  type="button"
                  onClick={() => onRefund(order.order_id)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-xl hover:from-orange-600 hover:to-red-600 shadow transition"
                >
                  Aprobă Retur & Restituie Banii
                </button>
              )}
            </div>
          )}

          {/* Ordered products table */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-2.5">
              Produse Comandate ({order.items.length})
            </h3>
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Produs</th>
                    <th className="px-4 py-2.5 text-center">Cantitate</th>
                    <th className="px-4 py-2.5 text-right">Preț unitar</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {order.items.map((item) => (
                    <tr key={item.item_id}>
                      <td className="px-4 py-3 font-medium text-neutral-900">
                        {item.title}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-neutral-700">
                        {item.quantity}x
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-neutral-600">
                        {(item.unit_amount_cents / 100).toFixed(2)} RON
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-neutral-900">
                        {((item.quantity * item.unit_amount_cents) / 100).toFixed(2)} RON
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment & Total summary */}
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <CreditCard size={16} className="text-neutral-500" />
              <span>Plată online card (Stripe) — Confirmată</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-neutral-500 mr-2 font-medium">Total Încasat:</span>
              <span className="text-lg font-black text-neutral-900 font-mono">
                {(order.total_cents / 100).toFixed(2)} RON
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between shrink-0">
          <div>
            {awbNumber ? (
              <button
                type="button"
                onClick={() => onPrintAwb(order)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-neutral-800 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-xl transition"
              >
                <Printer size={14} />
                Tipărește AWB
              </button>
            ) : (
              !isReturnRequested && !isRefunded && (
                <button
                  type="button"
                  onClick={() => onGenerateAwb(order)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition shadow-sm"
                >
                  <Package size={14} />
                  Generează AWB
                </button>
              )
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition"
          >
            Închide
          </button>
        </div>
      </div>
    </div>
  );
}
