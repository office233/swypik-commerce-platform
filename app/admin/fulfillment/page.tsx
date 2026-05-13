"use client";

import { useEffect, useState, useCallback } from "react";
import { Package, Truck, CheckCircle, AlertCircle, Search, RefreshCw, ChevronDown, ExternalLink, Clock } from "lucide-react";
import Link from "next/link";

const STATUS_BADGE: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "În așteptare", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  paid: { label: "Plătită", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  fulfilled: { label: "Expediată", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Truck },
  shipped: { label: "În tranzit", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Truck },
  delivered: { label: "Livrată", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle },
  return_requested: { label: "Retur solicitat", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertCircle },
  cancelled: { label: "Anulată", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
};

type Order = {
  id: string;
  status: string;
  fulfillmentStatus: string;
  totalRon: number;
  itemCount: number;
  customerEmail: string | null;
  trackingNumber: string | null;
  source: string;
  createdAt: string;
  fulfilledAt: string | null;
};

export default function AdminFulfillmentPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [newFulfillment, setNewFulfillment] = useState("");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/orders?${params}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleUpdate = async () => {
    if (!selectedOrder) return;
    setUpdating(true);
    setUpdateMsg("");

    try {
      const body: any = { orderId: selectedOrder.id };
      if (newStatus) body.status = newStatus;
      if (newFulfillment) body.fulfillmentStatus = newFulfillment;
      if (trackingNumber) body.trackingNumber = trackingNumber;
      if (trackingUrl) body.trackingUrl = trackingUrl;
      if (notes) body.notes = notes;

      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setUpdateMsg("✅ Comandă actualizată!");
        setSelectedOrder(null);
        setTrackingNumber("");
        setTrackingUrl("");
        setNewStatus("");
        setNewFulfillment("");
        setNotes("");
        fetchOrders();
      } else {
        setUpdateMsg("❌ " + (data.error || "Eroare"));
      }
    } catch {
      setUpdateMsg("❌ Eroare de rețea");
    } finally {
      setUpdating(false);
    }
  };

  const stats = {
    pending: orders.filter(o => o.status === "pending").length,
    paid: orders.filter(o => o.status === "paid").length,
    fulfilled: orders.filter(o => ["fulfilled", "shipped"].includes(o.fulfillmentStatus)).length,
    returns: orders.filter(o => o.status === "return_requested").length,
  };

  return (
    <div className="min-h-screen bg-[#F7F7F8]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="bg-white border-b border-[#E5E5E5] px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#0D0D0D]">📦 Fulfillment</h1>
            <p className="text-sm text-[#6E6E80]">{total} comenzi total</p>
          </div>
          <button onClick={fetchOrders} className="flex items-center gap-2 rounded-xl bg-[#0D0D0D] px-4 py-2.5 text-sm font-bold text-white">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-4">
            <p className="text-3xl font-black text-yellow-700">{stats.pending}</p>
            <p className="text-sm font-bold text-yellow-600">⏳ Neplătite</p>
          </div>
          <div className="rounded-2xl bg-green-50 border border-green-200 p-4">
            <p className="text-3xl font-black text-green-700">{stats.paid}</p>
            <p className="text-sm font-bold text-green-600">💳 Plătite (de expediat)</p>
          </div>
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4">
            <p className="text-3xl font-black text-blue-700">{stats.fulfilled}</p>
            <p className="text-sm font-bold text-blue-600">📦 Expediate</p>
          </div>
          <div className="rounded-2xl bg-orange-50 border border-orange-200 p-4">
            <p className="text-3xl font-black text-orange-700">{stats.returns}</p>
            <p className="text-sm font-bold text-orange-600">↩️ Retururi</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "", label: "Toate" },
            { value: "pending", label: "⏳ Pending" },
            { value: "paid", label: "💳 Plătite" },
            { value: "fulfilled", label: "📦 Expediate" },
            { value: "return_requested", label: "↩️ Retururi" },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-xl px-4 py-2 text-sm font-bold border transition-all ${
                statusFilter === f.value
                  ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
                  : "bg-white text-[#6E6E80] border-[#E5E5E5] hover:border-[#0D0D0D]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Update notification */}
        {updateMsg && (
          <div className="rounded-xl bg-white border border-[#E5E5E5] p-3 text-sm font-bold text-center">
            {updateMsg}
          </div>
        )}

        {/* Orders Table */}
        <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-[#E5E5E5] border-t-[#10A37F] rounded-full animate-spin mx-auto" />
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-[#6E6E80]">
              <Package size={48} className="mx-auto mb-3 text-[#D1D1D6]" />
              <p className="font-bold">Nu sunt comenzi cu acest filtru</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E5E5]">
              {orders.map(order => {
                const badge = STATUS_BADGE[order.status] || STATUS_BADGE.pending;
                const BadgeIcon = badge.icon;
                const isSelected = selectedOrder?.id === order.id;

                return (
                  <div key={order.id}>
                    <div
                      className={`flex items-center gap-4 p-4 hover:bg-[#FAFAFA] cursor-pointer transition-colors ${isSelected ? "bg-[#F0FDF4]" : ""}`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedOrder(null);
                        } else {
                          setSelectedOrder(order);
                          setTrackingNumber(order.trackingNumber || "");
                          setNewStatus(order.status);
                          setNewFulfillment(order.fulfillmentStatus);
                        }
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-black text-[#0D0D0D]">#{order.id.split("-")[0]}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}>
                            <BadgeIcon size={10} /> {badge.label}
                          </span>
                        </div>
                        <p className="text-xs text-[#6E6E80]">
                          {order.itemCount} produs(e) • {order.customerEmail || "—"} • {new Date(order.createdAt).toLocaleDateString("ro-RO")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-black text-[#10A37F]">{order.totalRon.toFixed(2)} lei</p>
                        {order.trackingNumber && (
                          <p className="text-[10px] text-[#6E6E80]">🚚 {order.trackingNumber}</p>
                        )}
                      </div>
                      <ChevronDown size={16} className={`text-[#A1A1AA] transition-transform ${isSelected ? "rotate-180" : ""}`} />
                    </div>

                    {/* Expanded edit panel */}
                    {isSelected && (
                      <div className="px-4 pb-4 bg-[#F7F7F8] border-t border-[#E5E5E5] animate-slideDown">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                          <div>
                            <label className="text-xs font-bold text-[#6E6E80] uppercase mb-1 block">Status comandă</label>
                            <select
                              value={newStatus}
                              onChange={(e) => setNewStatus(e.target.value)}
                              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm font-bold"
                            >
                              <option value="pending">Pending</option>
                              <option value="paid">Plătită</option>
                              <option value="fulfilled">Expediată</option>
                              <option value="shipped">În tranzit</option>
                              <option value="delivered">Livrată</option>
                              <option value="cancelled">Anulată</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-[#6E6E80] uppercase mb-1 block">Status fulfillment</label>
                            <select
                              value={newFulfillment}
                              onChange={(e) => setNewFulfillment(e.target.value)}
                              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm font-bold"
                            >
                              <option value="pending">Pending</option>
                              <option value="processing">Se procesează</option>
                              <option value="fulfilled">Expediată</option>
                              <option value="shipped">În tranzit</option>
                              <option value="delivered">Livrată</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-[#6E6E80] uppercase mb-1 block">AWB / Tracking Number</label>
                            <input
                              type="text"
                              value={trackingNumber}
                              onChange={(e) => setTrackingNumber(e.target.value)}
                              placeholder="ex: RO123456789"
                              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-[#6E6E80] uppercase mb-1 block">Tracking URL</label>
                            <input
                              type="text"
                              value={trackingUrl}
                              onChange={(e) => setTrackingUrl(e.target.value)}
                              placeholder="https://tracking.dhl.com/..."
                              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-xs font-bold text-[#6E6E80] uppercase mb-1 block">Note admin</label>
                            <textarea
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="Note interne..."
                              rows={2}
                              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm resize-none"
                            />
                          </div>
                        </div>
                        <div className="flex gap-3 mt-4">
                          <button
                            onClick={handleUpdate}
                            disabled={updating}
                            className="flex-1 rounded-xl bg-[#10A37F] py-3 text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                          >
                            {updating ? "Se salvează..." : "💾 Salvează modificările"}
                          </button>
                          <Link
                            href={`/orders/${order.id}?token=admin`}
                            target="_blank"
                            className="flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm font-bold text-[#6E6E80] hover:bg-[#F7F7F8] transition-colors"
                          >
                            <ExternalLink size={14} /> Vezi
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
