"use client";

/**
 * Swypik Fly — căutare + rezervare zboruri.
 * Flux: căutare → listă oferte (preț total, cu markup inclus) → pasageri →
 * Live Price Check → plată wallet sau Stripe. La price_changed (409),
 * afișăm noul preț și cerem reconfirmare.
 */

import { useCallback, useMemo, useState } from "react";
import { Plane, ArrowRight, Loader2, Users, CalendarDays, Wallet, CreditCard, CheckCircle2, AlertTriangle } from "lucide-react";

type Segment = { origin: string; destination: string; departAt: string; arriveAt: string; carrier: string; carrierName?: string; flightNumber?: string };
type Slice = { origin: string; destination: string; durationMinutes?: number; segments: Segment[] };
type Offer = {
  token: string;
  provider: "duffel" | "kiwi" | "travelpayouts";
  totalCents: number;
  currency: string;
  slices: Slice[];
  stops: number;
  carrier: string;
  carrierName?: string;
  raw?: { deepLink?: string };
};

type Passenger = { givenName: string; familyName: string; bornOn: string; type: "adult" };

const eur = (cents: number, currency = "EUR") =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });

const dur = (min?: number) => (min ? `${Math.floor(min / 60)}h ${min % 60}m` : "");

export default function FlyClient() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState({ origin: "OTP", destination: "", departDate: today, returnDate: "", adults: 1 });
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // checkout state
  const [selected, setSelected] = useState<Offer | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [contact, setContact] = useState({ email: "", phone: "" });
  const [booking, setBooking] = useState(false);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ bookingRef: string | null } | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOffers(null);
    setSelected(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/fly/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: form.origin.trim().toUpperCase(),
          destination: form.destination.trim().toUpperCase(),
          departDate: form.departDate,
          returnDate: form.returnDate || null,
          adults: form.adults,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Căutarea a eșuat");
      setOffers(json.offers ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [form]);

  const startCheckout = (offer: Offer) => {
    if (offer.provider === "travelpayouts") {
      // Low-cost: rezervarea se face la partener prin link afiliat (comision Swypik).
      if (offer.raw?.deepLink) window.open(offer.raw.deepLink, "_blank", "noopener");
      return;
    }
    setSelected(offer);
    setPriceNotice(null);
    setSuccess(null);
    setPassengers(
      Array.from({ length: form.adults }, () => ({ givenName: "", familyName: "", bornOn: "", type: "adult" as const })),
    );
  };

  const pay = useCallback(
    async (method: "wallet" | "stripe") => {
      if (!selected) return;
      setBooking(true);
      setError(null);
      setPriceNotice(null);
      try {
        // 1. Live price check — evită capcana cache-ului.
        const pc = await fetch("/api/fly/price-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: selected.token }),
        });
        const pcJson = await pc.json();
        if (!pc.ok || !pcJson.ok) throw new Error(pcJson.message ?? "Oferta a expirat. Reia căutarea.");
        if (pcJson.priceChanged) {
          setSelected({ ...selected, totalCents: pcJson.totalCents });
          setPriceNotice(
            pcJson.deltaCents > 0
              ? `Prețul a crescut cu ${eur(pcJson.deltaCents)} — noul total: ${eur(pcJson.totalCents)}. Apasă din nou pentru a confirma.`
              : `Veste bună: prețul a scăzut! Noul total: ${eur(pcJson.totalCents)}. Apasă din nou pentru a confirma.`,
          );
          return;
        }

        // 2. Order.
        const res = await fetch("/api/fly/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: selected.token,
            passengers,
            contactEmail: contact.email,
            contactPhone: contact.phone,
            paymentMethod: method,
          }),
        });
        const json = await res.json();
        if (res.status === 409 && json.code === "price_changed") {
          setSelected({ ...selected, totalCents: json.newTotalCents });
          setPriceNotice(`Prețul s-a schimbat: noul total e ${eur(json.newTotalCents)}. Apasă din nou pentru a confirma.`);
          return;
        }
        if (res.status === 401) throw new Error("Autentifică-te pentru a rezerva (contul tău Swypik).");
        if (!res.ok) throw new Error(json.error ?? "Rezervarea a eșuat");
        if (json.checkoutUrl) {
          window.location.href = json.checkoutUrl;
          return;
        }
        setSuccess({ bookingRef: json.bookingRef ?? null });
        setSelected(null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBooking(false);
      }
    },
    [selected, passengers, contact],
  );

  const passengersValid =
    passengers.length > 0 &&
    passengers.every((p) => p.givenName && p.familyName && p.bornOn) &&
    /\S+@\S+\.\S+/.test(contact.email) &&
    contact.phone.length >= 6;

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600">
          <Plane size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Swypik Fly</h1>
          <p className="text-xs text-neutral-500">Zboruri la preț net + 2€. Fără comisioane ascunse.</p>
        </div>
      </header>

      {/* Formular căutare */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-neutral-500">
            De la (IATA)
            <input
              value={form.origin}
              onChange={(e) => setForm({ ...form, origin: e.target.value.toUpperCase().slice(0, 3) })}
              placeholder="OTP"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base font-semibold uppercase tracking-widest dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="text-xs font-medium text-neutral-500">
            Spre (IATA)
            <input
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value.toUpperCase().slice(0, 3) })}
              placeholder="BCN"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base font-semibold uppercase tracking-widest dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="text-xs font-medium text-neutral-500">
            <span className="flex items-center gap-1"><CalendarDays size={12} /> Plecare</span>
            <input
              type="date"
              min={today}
              value={form.departDate}
              onChange={(e) => setForm({ ...form, departDate: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="text-xs font-medium text-neutral-500">
            <span className="flex items-center gap-1"><CalendarDays size={12} /> Întoarcere (opțional)</span>
            <input
              type="date"
              min={form.departDate}
              value={form.returnDate}
              onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="text-xs font-medium text-neutral-500">
            <span className="flex items-center gap-1"><Users size={12} /> Pasageri</span>
            <select
              value={form.adults}
              onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? "adult" : "adulți"}</option>
              ))}
            </select>
          </label>
          <button
            onClick={search}
            disabled={loading || form.origin.length !== 3 || form.destination.length !== 3}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2.5 font-semibold text-white shadow disabled:opacity-40"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Plane size={18} />}
            Caută
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Bilet emis! ✈️</p>
            {success.bookingRef && <p className="text-sm">Cod rezervare (PNR): <b>{success.bookingRef}</b></p>}
            <p className="mt-1 text-xs">Detaliile au fost trimise pe email. Poftă bună în drum spre aeroport — vezi Swypik Eats 😉</p>
          </div>
        </div>
      )}

      {/* Rezultate */}
      {offers && !selected && (
        <div className="mt-5 space-y-3">
          <p className="text-xs text-neutral-500">{offers.length} zboruri găsite · sortate după preț · totalul include tot</p>
          {offers.length === 0 && <p className="rounded-xl bg-neutral-100 p-4 text-sm dark:bg-neutral-800">Niciun zbor pe ruta/data aleasă.</p>}
          {offers.map((o) => (
            <button
              key={o.token}
              onClick={() => startCheckout(o)}
              className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900"
            >
              {o.slices.map((s, i) => (
                <div key={i} className={`flex items-center justify-between ${i > 0 ? "mt-2 border-t border-dashed border-neutral-200 pt-2 dark:border-neutral-700" : ""}`}>
                  <div className="text-center">
                    <p className="text-lg font-bold">{hhmm(s.segments[0].departAt)}</p>
                    <p className="text-xs text-neutral-500">{s.origin}</p>
                  </div>
                  <div className="flex-1 px-3 text-center">
                    <p className="text-[10px] text-neutral-400">{dur(s.durationMinutes)}</p>
                    <div className="relative my-1 h-px bg-neutral-300 dark:bg-neutral-600">
                      <ArrowRight size={12} className="absolute -top-1.5 right-0 text-neutral-400" />
                    </div>
                    <p className="text-[10px] text-neutral-400">
                      {s.segments.length - 1 === 0 ? "direct" : `${s.segments.length - 1} escală`}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{hhmm(s.segments[s.segments.length - 1].arriveAt)}</p>
                    <p className="text-xs text-neutral-500">{s.destination}</p>
                  </div>
                </div>
              ))}
              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-800">
                <span className="text-xs text-neutral-500">{o.carrierName || o.carrier} · {o.provider === "duffel" ? "emitere instant" : o.provider === "travelpayouts" ? "rezervare la partener" : "via Kiwi"}</span>
                <span className="text-lg font-extrabold text-sky-600 dark:text-sky-400">{eur(o.totalCents, o.currency)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Checkout */}
      {selected && (
        <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Pasageri & plată</h2>
            <button onClick={() => setSelected(null)} className="text-xs text-neutral-500 underline">înapoi la rezultate</button>
          </div>

          {passengers.map((p, i) => (
            <div key={i} className="mb-3 grid grid-cols-2 gap-2">
              <p className="col-span-2 text-xs font-medium text-neutral-500">Pasager {i + 1} (ca în pașaport/CI)</p>
              <input
                placeholder="Prenume"
                value={p.givenName}
                onChange={(e) => setPassengers(passengers.map((x, j) => (j === i ? { ...x, givenName: e.target.value } : x)))}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
              <input
                placeholder="Nume"
                value={p.familyName}
                onChange={(e) => setPassengers(passengers.map((x, j) => (j === i ? { ...x, familyName: e.target.value } : x)))}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
              <label className="col-span-2 text-xs text-neutral-500">
                Data nașterii
                <input
                  type="date"
                  value={p.bornOn}
                  onChange={(e) => setPassengers(passengers.map((x, j) => (j === i ? { ...x, bornOn: e.target.value } : x)))}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                />
              </label>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Email contact"
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
            <input
              placeholder="Telefon"
              value={contact.phone}
              onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>

          {priceNotice && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">{priceNotice}</div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-neutral-500">Total de plată</span>
            <span className="text-2xl font-extrabold">{eur(selected.totalCents, selected.currency)}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => pay("wallet")}
              disabled={booking || !passengersValid}
              className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {booking ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />} Wallet
            </button>
            <button
              onClick={() => pay("stripe")}
              disabled={booking || !passengersValid}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-40"
            >
              {booking ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} Card
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-neutral-400">
            Prețul e reverificat live la furnizor înainte de plată. Emitere instant pentru ofertele Duffel.
          </p>
        </div>
      )}
    </div>
  );
}
