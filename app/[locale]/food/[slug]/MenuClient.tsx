"use client";

/**
 * Meniul unui restaurant + coș local + plasare comandă.
 * Coșul e per-restaurant (localStorage) — la fel ca Bolt Food.
 * Prețurile afișate sunt orientative; serverul recalculează totul la comandă.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Clock, Minus, Plus, ShoppingBag, Star, Truck } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { isOpenNow } from "@/lib/merchants/hours";

const ACCENT = "#2DBE60";

interface MenuChoice { id?: string; name: string; price_cents?: number }
interface MenuOption { name: string; required?: boolean; max?: number; choices?: MenuChoice[] }
interface MenuItem {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  image_url: string | null;
  options: MenuOption[];
  allergens: string[];
}
interface MenuSection { id: string | null; name: string; items: MenuItem[] }

interface Merchant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cuisine_types: string[];
  phone: string;
  address: string;
  location_city: string | null;
  delivery_fee_cents: number;
  min_order_cents: number;
  avg_prep_minutes: number;
  opening_hours: unknown;
  is_open_override: boolean | null;
  rating: number | null;
  image_url: string | null;
}

interface CartLine {
  menu_item_id: string;
  name: string;
  unit_price_cents: number;
  qty: number;
  option_ids: string[];
  option_names: string[];
}

export default function MenuClient({ merchant }: { merchant: Merchant }) {
  const router = useRouter();
  const [menu, setMenu] = useState<MenuSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picker, setPicker] = useState<MenuItem | null>(null);
  const [pickedOptions, setPickedOptions] = useState<string[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ order_number: string } | null>(null);
  const [error, setError] = useState("");

  // formular livrare
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const cartKey = `swypik_food_cart_${merchant.id}`;
  const open = isOpenNow(merchant.opening_hours, merchant.is_open_override);

  useEffect(() => {
    fetch(`/api/merchants/${merchant.id}/menu`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setMenu(d.menu ?? []);
      })
      .finally(() => setLoading(false));
    try {
      const saved = localStorage.getItem(cartKey);
      if (saved) setCart(JSON.parse(saved));
    } catch { /* corupt — ignorăm */ }
  }, [merchant.id, cartKey]);

  useEffect(() => {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, cartKey]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unit_price_cents * l.qty, 0), [cart]);
  const total = subtotal + (subtotal > 0 ? merchant.delivery_fee_cents : 0);
  const fmtLei = (c: number) => `${(c / 100).toLocaleString("ro-RO", { minimumFractionDigits: 2 })} lei`;
  const belowMin = subtotal > 0 && subtotal < merchant.min_order_cents;

  const addToCart = useCallback((item: MenuItem, optionIds: string[]) => {
    haptic("success");
    const allChoices = (item.options ?? []).flatMap((o) =>
      (o.choices ?? []).map((c) => ({ ...c, _id: c.id ?? `${o.name}:${c.name}` })),
    );
    const chosen = optionIds
      .map((oid) => allChoices.find((c) => c._id === oid))
      .filter(Boolean) as (MenuChoice & { _id: string })[];
    const unit = item.price_cents + chosen.reduce((s, c) => s + (c.price_cents ?? 0), 0);
    const key = item.id + "|" + optionIds.sort().join(",");

    setCart((prev) => {
      const existing = prev.find((l) => l.menu_item_id + "|" + l.option_ids.sort().join(",") === key);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          unit_price_cents: unit,
          qty: 1,
          option_ids: optionIds,
          option_names: chosen.map((c) => c.name),
        },
      ];
    });
    setPicker(null);
    setPickedOptions([]);
  }, []);

  const changeQty = (idx: number, delta: number) => {
    haptic("tap");
    setCart((prev) =>
      prev
        .map((l, i) => (i === idx ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const placeOrder = async () => {
    setError("");
    setPlacing(true);
    try {
      const res = await fetch("/api/local-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchant.id,
          items: cart.map((l) => ({ menu_item_id: l.menu_item_id, qty: l.qty, option_ids: l.option_ids })),
          customer_name: name,
          customer_phone: phone,
          delivery_address: address,
          delivery_notes: notes || undefined,
          payment_method: "cash",
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Eroare la plasarea comenzii.");
        return;
      }
      setPlaced(data.order);
      setCart([]);
      localStorage.removeItem(cartKey);
    } finally {
      setPlacing(false);
    }
  };

  // ── ecran de confirmare ──
  if (placed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-white px-6 pb-24">
        <div className="text-center">
          <div className="mb-4 text-6xl" aria-hidden>✅</div>
          <h1 className="text-xl font-black">Comandă plasată!</h1>
          <p className="mt-2 text-sm text-[#6E6E80]">
            Numărul comenzii: <span className="font-black text-[#0D0D0D]">{placed.order_number}</span>
          </p>
          <p className="mt-1 text-sm text-[#6E6E80]">
            {merchant.name} confirmă în câteva minute. Plata: cash la livrare.
          </p>
          <button
            type="button"
            onClick={() => router.push("/food")}
            style={{ backgroundColor: ACCENT }}
            className="mt-6 h-12 rounded-xl px-6 text-sm font-bold text-white transition active:scale-95"
          >
            Înapoi la restaurante
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white pb-40">
      {/* Cover + header */}
      <div className="relative h-40 bg-[#F7F7F8]">
        {merchant.image_url && (
          <Image src={merchant.image_url} alt={merchant.name} fill sizes="100vw" className="object-cover" />
        )}
        <button
          type="button"
          onClick={() => router.push("/food")}
          aria-label="Înapoi"
          className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow transition active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4">
        <div className="-mt-6 rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-black leading-tight">{merchant.name}</h1>
            {merchant.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold">
                <Star size={14} fill="#FACC15" className="text-[#FACC15]" />
                {Number(merchant.rating).toFixed(1)}
              </span>
            )}
          </div>
          {merchant.cuisine_types?.length > 0 && (
            <p className="mt-0.5 text-xs text-[#6E6E80]">{merchant.cuisine_types.join(" · ")}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[#6E6E80]">
            <span className="inline-flex items-center gap-1">
              <Clock size={13} />
              {merchant.avg_prep_minutes + 25}–{merchant.avg_prep_minutes + 40} min
            </span>
            <span className="inline-flex items-center gap-1">
              <Truck size={13} />
              {merchant.delivery_fee_cents === 0 ? "Livrare gratuită" : fmtLei(merchant.delivery_fee_cents)}
            </span>
            {merchant.min_order_cents > 0 && <span>minim {fmtLei(merchant.min_order_cents)}</span>}
            <span className={`font-black ${open ? "" : "text-red-600"}`} style={open ? { color: ACCENT } : undefined}>
              {open ? "● Deschis" : "● Închis"}
            </span>
          </div>
        </div>
      </div>

      {/* Meniu */}
      <main className="px-4 pt-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#F7F7F8]" />
            ))}
          </div>
        ) : menu.length === 0 ? (
          <p className="py-12 text-center text-sm text-[#6E6E80]">Meniul se încarcă în curând.</p>
        ) : (
          menu.map((section) => (
            <section key={section.id ?? "other"} className="mb-6">
              <h2 className="mb-2.5 text-[15px] font-black">{section.name}</h2>
              <div className="space-y-2.5">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!open}
                    onClick={() => {
                      haptic("tap");
                      if ((item.options ?? []).length > 0) {
                        setPicker(item);
                        setPickedOptions([]);
                      } else {
                        addToCart(item, []);
                      }
                    }}
                    className="flex w-full gap-3 rounded-2xl border border-[#E5E5E5] bg-white p-3 text-left transition active:scale-[0.98] disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold leading-snug">{item.name}</h3>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-[#6E6E80]">{item.description}</p>
                      )}
                      <p className="mt-1.5 text-sm font-black">{fmtLei(item.price_cents)}</p>
                    </div>
                    {item.image_url ? (
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F7F7F8]">
                        <Image src={item.image_url} alt={item.name} fill sizes="80px" className="object-cover" />
                      </div>
                    ) : (
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center self-center rounded-full text-white"
                        style={{ backgroundColor: ACCENT }}
                        aria-hidden
                      >
                        <Plus size={18} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Picker de opțiuni */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setPicker(null)}>
          <div
            className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black">{picker.name}</h3>
            {(picker.options ?? []).map((opt) => (
              <div key={opt.name} className="mt-4">
                <p className="text-xs font-black uppercase tracking-wide text-[#6E6E80]">
                  {opt.name}
                  {opt.required && <span className="text-red-500"> *</span>}
                </p>
                <div className="mt-2 space-y-1.5">
                  {(opt.choices ?? []).map((c) => {
                    const cid = c.id ?? `${opt.name}:${c.name}`;
                    const active = pickedOptions.includes(cid);
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => {
                          haptic("tap");
                          setPickedOptions((prev) => {
                            if (active) return prev.filter((x) => x !== cid);
                            // respectăm max per grup
                            const groupIds = (opt.choices ?? []).map((x) => x.id ?? `${opt.name}:${x.name}`);
                            const inGroup = prev.filter((x) => groupIds.includes(x));
                            const max = opt.max ?? 1;
                            const cleaned = inGroup.length >= max
                              ? prev.filter((x) => x !== inGroup[0])
                              : prev;
                            return [...cleaned, cid];
                          });
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
                          active ? "text-white" : "border-[#E5E5E5] text-[#0D0D0D]"
                        }`}
                        style={active ? { backgroundColor: ACCENT, borderColor: ACCENT } : undefined}
                      >
                        <span>{c.name}</span>
                        {c.price_cents ? <span>+{fmtLei(c.price_cents)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                // opțiunile required trebuie să aibă o alegere
                const missing = (picker.options ?? []).some((o) => {
                  if (!o.required) return false;
                  const ids = (o.choices ?? []).map((c) => c.id ?? `${o.name}:${c.name}`);
                  return !pickedOptions.some((p) => ids.includes(p));
                });
                if (missing) {
                  haptic("warning");
                  return;
                }
                addToCart(picker, pickedOptions);
              }}
              style={{ backgroundColor: ACCENT }}
              className="mt-5 h-12 w-full rounded-xl text-sm font-bold text-white transition active:scale-95"
            >
              Adaugă în coș
            </button>
          </div>
        </div>
      )}

      {/* Bara de coș */}
      {cart.length > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E5E5] bg-white/95 p-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-xl">
          {belowMin && (
            <p className="mb-2 text-center text-xs font-bold text-amber-600">
              Comanda minimă e {fmtLei(merchant.min_order_cents)} — mai adaugă {fmtLei(merchant.min_order_cents - subtotal)}
            </p>
          )}
          <button
            type="button"
            disabled={belowMin || !open}
            onClick={() => {
              haptic("tap");
              setCheckout(true);
            }}
            style={{ backgroundColor: ACCENT }}
            className="flex h-13 w-full items-center justify-between rounded-2xl px-5 py-3.5 text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2 text-sm font-black">
              <ShoppingBag size={18} />
              {cart.reduce((s, l) => s + l.qty, 0)} produse
            </span>
            <span className="text-sm font-black">{fmtLei(total)}</span>
          </button>
        </div>
      )}

      {/* Checkout */}
      {checkout && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setCheckout(false)}>
          <div
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black">Finalizează comanda</h3>

            <div className="mt-3 space-y-2 rounded-2xl bg-[#F7F7F8] p-3">
              {cart.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{l.name}</p>
                    {l.option_names.length > 0 && (
                      <p className="truncate text-xs text-[#6E6E80]">{l.option_names.join(", ")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => changeQty(i, -1)} aria-label="Scade" className="grid h-7 w-7 place-items-center rounded-full bg-white"><Minus size={14} /></button>
                    <span className="w-5 text-center font-black">{l.qty}</span>
                    <button type="button" onClick={() => changeQty(i, 1)} aria-label="Crește" className="grid h-7 w-7 place-items-center rounded-full bg-white"><Plus size={14} /></button>
                  </div>
                  <span className="w-20 text-right font-black">{fmtLei(l.unit_price_cents * l.qty)}</span>
                </div>
              ))}
              <div className="border-t border-[#E5E5E5] pt-2 text-sm">
                <div className="flex justify-between text-[#6E6E80]"><span>Livrare</span><span>{merchant.delivery_fee_cents === 0 ? "Gratuită" : fmtLei(merchant.delivery_fee_cents)}</span></div>
                <div className="mt-1 flex justify-between font-black"><span>Total</span><span>{fmtLei(total)}</span></div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Numele tău *" className="h-12 w-full rounded-xl border border-[#E5E5E5] px-4 text-sm font-medium outline-none focus:border-[#2DBE60]" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon *" inputMode="tel" className="h-12 w-full rounded-xl border border-[#E5E5E5] px-4 text-sm font-medium outline-none focus:border-[#2DBE60]" />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresa de livrare *" className="h-12 w-full rounded-xl border border-[#E5E5E5] px-4 text-sm font-medium outline-none focus:border-[#2DBE60]" />
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mențiuni (opțional)" className="h-12 w-full rounded-xl border border-[#E5E5E5] px-4 text-sm font-medium outline-none focus:border-[#2DBE60]" />
            </div>

            {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}

            <p className="mt-3 text-center text-xs text-[#6E6E80]">💵 Plata: cash la livrare (plata cu cardul vine în curând)</p>

            <button
              type="button"
              disabled={placing || name.trim().length < 2 || phone.trim().length < 5 || address.trim().length < 5}
              onClick={placeOrder}
              style={{ backgroundColor: ACCENT }}
              className="mt-3 h-13 w-full rounded-2xl py-3.5 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {placing ? "Se trimite…" : `Comandă — ${fmtLei(total)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
