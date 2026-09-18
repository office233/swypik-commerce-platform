"use client";

import { useState } from "react";
import { Zap, ShieldCheck, Check, Truck, CreditCard, Lock } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface InstantVideoCheckoutModalProps {
  product: {
    id: string;
    title: string;
    price: number;
    images: string[];
    category?: string;
  };
  currency?: "RON" | "EUR";
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

export default function InstantVideoCheckoutModal({
  product,
  currency = "RON",
  onClose,
  onSuccess,
}: InstantVideoCheckoutModalProps) {
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<"fan" | "sameday">("fan");
  const [paymentMethod, setPaymentMethod] = useState<"apple_pay" | "card" | "cod">("apple_pay");
  
  // Fraud Shield: simulat pentru utilizator cu scor de risc ridicat
  const [userRiskScore] = useState(() => Math.floor(Math.random() * 25) + 10); // 10-35% (low risk by default)
  const isHighRisk = userRiskScore > 85;

  const exchangeRate = currency === "EUR" ? 0.20 : 1.0;
  const priceDisplay = (product.price * exchangeRate).toFixed(currency === "EUR" ? 2 : 0);
  const shippingCost = currency === "EUR" ? 3.5 : 15.0;
  const totalCost = (Number(priceDisplay) + shippingCost).toFixed(currency === "EUR" ? 2 : 0);

  const handle1ClickBuy = async () => {
    haptic("success");
    setProcessing(true);

    // Simulare tranzactie biometrica / card salvat in sub 1 secunda
    setTimeout(() => {
      setProcessing(false);
      setCompleted(true);
      haptic("tap");
      const orderId = `SWYP-${Math.floor(100000 + Math.random() * 900000)}`;
      setTimeout(() => {
        onSuccess(orderId);
      }, 1200);
    }, 850);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-neutral-950 text-white p-5 border border-white/10 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
        {/* Header cu Insigna de Integritate */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/20 text-amber-400">
              <Zap size={18} className="fill-amber-400" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-tight">1-Click Instant Checkout</span>
                <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Direct pe Video
                </span>
              </div>
              <p className="text-[10px] text-neutral-400">Comanda transmisa in ERP in sub 1 secunda</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Produs & Pret */}
        <div className="flex items-center gap-3 py-3 border-b border-white/10">
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.title}
              className="h-14 w-14 rounded-xl object-cover border border-white/10 shrink-0"
            />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-neutral-800 border border-white/10 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black text-white truncate">{product.title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-base font-black text-amber-400">
                {priceDisplay} {currency}
              </span>
              <span className="text-[10px] text-neutral-400">
                + {shippingCost} {currency} curier
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold mt-0.5">
              <ShieldCheck size={12} />
              <span>Garantie Integritate AI: Autentic sau Banii Inapoi Instant</span>
            </div>
          </div>
        </div>

        {/* Adresa Livrare Autocompletata & Curier */}
        <div className="py-3 space-y-2 text-xs border-b border-white/10">
          <div className="flex items-center justify-between text-neutral-400 text-[11px]">
            <span>Adresa de livrare salvata:</span>
            <span className="text-white font-bold">Bucuresti, Sector 1 (GPS Validat)</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSelectedCourier("fan")}
              className={`flex items-center justify-between p-2 rounded-xl border text-[11px] font-bold transition ${
                selectedCourier === "fan"
                  ? "bg-white/10 border-amber-400/80 text-white"
                  : "bg-white/5 border-white/10 text-neutral-400"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Truck size={13} />
                <span>Fan Courier</span>
              </span>
              <span className="text-[10px] text-emerald-400">24-48h</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCourier("sameday")}
              className={`flex items-center justify-between p-2 rounded-xl border text-[11px] font-bold transition ${
                selectedCourier === "sameday"
                  ? "bg-white/10 border-amber-400/80 text-white"
                  : "bg-white/5 border-white/10 text-neutral-400"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Truck size={13} />
                <span>Sameday Easybox</span>
              </span>
              <span className="text-[10px] text-emerald-400">Next Day</span>
            </button>
          </div>
        </div>

        {/* Metoda de Plata (Cu Scut Anti-Frauda Ramburs) */}
        <div className="py-3 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-400">Metoda de plata rapida:</span>
            {isHighRisk && (
              <span className="text-[9px] text-rose-400 font-black flex items-center gap-1">
                <Lock size={10} /> Ramburs dezactivat (Scut Risc Activ)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("apple_pay")}
              className={`flex-1 py-2 rounded-xl border font-black text-xs transition flex items-center justify-center gap-1.5 ${
                paymentMethod === "apple_pay"
                  ? "bg-white text-black border-white shadow-md"
                  : "bg-white/5 text-neutral-300 border-white/10"
              }`}
            >
              <span>Apple Pay / Biometric</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              className={`flex-1 py-2 rounded-xl border font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                paymentMethod === "card"
                  ? "bg-white text-black border-white shadow-md"
                  : "bg-white/5 text-neutral-300 border-white/10"
              }`}
            >
              <CreditCard size={13} />
              <span>Card salvat (*8842)</span>
            </button>
          </div>
        </div>

        {/* Buton de Cumparare 1-Click */}
        <button
          type="button"
          disabled={processing || completed}
          onClick={handle1ClickBuy}
          className={`w-full mt-2 rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            completed
              ? "bg-emerald-500 text-black shadow-[0_0_24px_rgba(16,185,129,0.5)]"
              : "bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-[0_4px_24px_rgba(245,158,11,0.4)]"
          }`}
        >
          {processing ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
              <span>Se proceseaza securizat (0.8s)...</span>
            </span>
          ) : completed ? (
            <span className="flex items-center gap-2">
              <Check size={18} strokeWidth={3} />
              <span>Comanda Confirmata! Transmisa in ERP</span>
            </span>
          ) : (
            <>
              <Zap size={16} className="fill-black" />
              <span>Confirma Plata 1-Click - {totalCost} {currency}</span>
            </>
          )}
        </button>

        <p className="text-center text-[9px] text-neutral-500 mt-2 flex items-center justify-center gap-1">
          <Lock size={10} />
          <span>Securizat prin Swypik Vault - AWB generat instant prin API Weaver</span>
        </p>
      </div>
    </div>
  );
}
