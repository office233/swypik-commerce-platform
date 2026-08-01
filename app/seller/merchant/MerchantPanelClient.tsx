"use client";

/**
 * Panou comerciant local: comenzi live (polling 10s, sunet la comandă nouă),
 * toggle „închid acum" (is_open_override) + meniu (adăugare rapidă articole).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Merchant = {
  id: string;
  name: string;
  kind: string;
  status: string;
  is_open_override: boolean | null;
};

type OrderItem = { name: string; qty: number; unit_price_cents: number };

type LocalOrder = {
  id: string;
  order_number: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_notes: string | null;
  items: OrderItem[];
  total_cents: number;
  currency: string;
  placed_at: string;
};

type MenuItem = {
  id: string;
  name: string;
  price_cents: number;
  is_available: boolean;
  category_id: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  placed: "Nouă",
  accepted: "Acceptată",
  preparing: "Se prepară",
  ready: "Gata",
  picked_up: "Ridicată",
  delivered: "Livrată",
  cancelled: "Anulată",
  rejected: "Respinsă",
};

const NEXT_STATUS: Record<string, { to: string; label: string }[]> = {
  placed: [
    { to: "accepted", label: "Acceptă" },
    { to: "rejected", label: "Respinge" },
  ],
  accepted: [{ to: "preparing", label: "Începe prepararea" }],
  preparing: [{ to: "ready", label: "Gata de ridicare" }],
};

function lei(cents: number): string {
  return (cents / 100).toFixed(2);
}

function playDing(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    // audio indisponibil — ignorăm
  }
}

export default function MerchantPanelClient() {
  const t = useTranslations("sellerMerchant");
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: "", price: "" });
  const knownIds = useRef<Set<string>>(new Set());
  const firstPoll = useRef(true);

  const merchant = merchants.find((m) => m.id === merchantId) ?? null;
  const isClosed = merchant?.is_open_override === false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/merchants/mine");
        if (res.status === 401) {
          if (!cancelled) setError("Autentifică-te ca seller pentru a accesa panoul.");
          return;
        }
        const data = (await res.json()) as { merchants?: Merchant[] };
        if (!cancelled) {
          const list = data.merchants ?? [];
          setMerchants(list);
          if (list.length > 0) setMerchantId(list[0].id);
          if (list.length === 0) setError("Nu ai niciun comerciant înregistrat. Creează unul din /api/merchants.");
        }
      } catch {
        if (!cancelled) setError("Eroare de rețea.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pollOrders = useCallback(async () => {
    if (!merchantId) return;
    try {
      const res = await fetch(`/api/merchants/${merchantId}/orders?status=active&limit=100`);
      if (!res.ok) return;
      const data = (await res.json()) as { orders?: LocalOrder[] };
      const list = data.orders ?? [];
      const hasNew = list.some((o) => !knownIds.current.has(o.id));
      if (hasNew && !firstPoll.current) playDing();
      list.forEach((o) => knownIds.current.add(o.id));
      firstPoll.current = false;
      setOrders(list);
    } catch {
      // polling — reîncercăm la următorul tick
    }
  }, [merchantId]);

  useEffect(() => {
    if (!merchantId) return;
    firstPoll.current = true;
    knownIds.current = new Set();
    void pollOrders();
    const t = setInterval(() => void pollOrders(), 10_000);
    return () => clearInterval(t);
  }, [merchantId, pollOrders]);

  const loadMenu = useCallback(async () => {
    if (!merchantId) return;
    const res = await fetch(`/api/merchants/${merchantId}/menu`);
    if (!res.ok) return;
    const data = (await res.json()) as { menu?: { id: string | null; name: string; items: MenuItem[] }[] };
    setMenu((data.menu ?? []).flatMap((c) => c.items));
  }, [merchantId]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  async function toggleOpen(): Promise<void> {
    if (!merchant) return;
    const next = isClosed ? null : false; // null = program normal, false = închis forțat
    const res = await fetch("/api/merchants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_id: merchant.id, is_open_override: next }),
    });
    if (res.ok) {
      setMerchants((prev) => prev.map((m) => (m.id === merchant.id ? { ...m, is_open_override: next } : m)));
    }
  }

  async function setOrderStatus(orderId: string, status: string): Promise<void> {
    const res = await fetch(`/api/local-orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) void pollOrders();
  }

  async function addMenuItem(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!merchantId || !newItem.name.trim()) return;
    const price = Number(newItem.price);
    if (!Number.isFinite(price) || price <= 0) return;
    const res = await fetch(`/api/merchants/${merchantId}/menu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newItem.name.trim(), price }),
    });
    if (res.ok) {
      setNewItem({ name: "", price: "" });
      void loadMenu();
    }
  }

  async function toggleItemAvailable(item: MenuItem): Promise<void> {
    const res = await fetch(`/api/merchants/${merchantId}/menu`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: item.id, is_available: !item.is_available }),
    });
    if (res.ok) void loadMenu();
  }

  if (loading) return <div className="p-8 text-center text-gray-500">{t("loading")}</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!merchant) return <div className="p-8 text-center text-gray-500">Niciun comerciant.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{merchant.name}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {merchants.length > 1 && (
            <select
              className="rounded border px-2 py-1 text-sm"
              value={merchantId ?? ""}
              onChange={(e) => setMerchantId(e.target.value)}
            >
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => void toggleOpen()}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${isClosed ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              }`}
          >
            {isClosed ? "Redeschide" : "Închid acum"}
          </button>
        </div>
      </header>

      {isClosed && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Ești marcat ca ÎNCHIS — clienții nu pot plasa comenzi noi.
        </div>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Comenzi active ({orders.length})</h2>
        {orders.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
            Nicio comandă activă. Sunetul te anunță când vine una nouă.
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm font-bold">{o.order_number}</span>{" "}
                    <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </div>
                  <span className="font-semibold">{lei(o.total_cents)} {o.currency}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {o.customer_name} · {o.customer_phone} · {o.delivery_address}
                </p>
                {o.delivery_notes && <p className="text-xs italic text-gray-500">„{o.delivery_notes}&rdquo;</p>}
                <ul className="mt-2 text-sm">
                  {(o.items ?? []).map((it, i) => (
                    <li key={i}>{it.qty}× {it.name} — {lei(it.unit_price_cents * it.qty)} lei</li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  {(NEXT_STATUS[o.status] ?? []).map((a) => (
                    <button
                      key={a.to}
                      onClick={() => void setOrderStatus(o.id, a.to)}
                      className={`rounded px-3 py-1.5 text-sm font-medium text-white ${a.to === "rejected" ? "bg-red-500 hover:bg-red-600" : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Meniu ({menu.length} articole)</h2>
        <form onSubmit={(e) => void addMenuItem(e)} className="mb-3 flex flex-wrap gap-2">
          <input
            className="flex-1 rounded border px-3 py-2 text-sm"
            placeholder="Nume articol (ex: Pizza Margherita)"
            value={newItem.name}
            onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
          />
          <input
            className="w-28 rounded border px-3 py-2 text-sm"
            placeholder={t("pricePlaceholder")}
            inputMode="decimal"
            value={newItem.price}
            onChange={(e) => setNewItem((p) => ({ ...p, price: e.target.value }))}
          />
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Adaugă
          </button>
        </form>
        <ul className="divide-y rounded-lg border bg-white">
          {menu.map((it) => (
            <li key={it.id} className="flex items-center justify-between p-3 text-sm">
              <span className={it.is_available ? "" : "text-gray-400 line-through"}>
                {it.name} — {lei(it.price_cents)} lei
              </span>
              <button
                onClick={() => void toggleItemAvailable(it)}
                className={`rounded px-2 py-1 text-xs font-medium ${it.is_available ? "bg-gray-200 text-gray-700" : "bg-green-100 text-green-700"
                  }`}
              >
                {it.is_available ? "Dezactivează" : "Activează"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
