"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Store,
  Search,
  Barcode,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  CheckCircle2,
  Printer,
  RotateCcw,
  Package,
} from "lucide-react";

export type PosProduct = {
  id: string;
  title: string;
  priceCents: number;
  stock: number;
  imageUrl: string | null;
  sku: string | null;
  category: string | null;
};

type CartItem = {
  product: PosProduct;
  quantity: number;
};

type Props = {
  initialProducts: PosProduct[];
};

export default function PosClient({ initialProducts }: Props) {
  const [products, setProducts] = useState<PosProduct[]>(initialProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter products by search (title, sku, id)
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
  }, [products, searchQuery]);

  // If exact barcode match, auto-add to cart
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearchQuery("");
    }
  };

  const addToCart = (product: PosProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setCashGiven("");
  };

  // Calculations (Standard Romanian VAT 21%)
  const totalCents = cart.reduce((acc, item) => acc + item.product.priceCents * item.quantity, 0);
  const totalRon = totalCents / 100;
  const tvaRon = totalRon - totalRon / 1.21;
  const subtotalRon = totalRon - tvaRon;

  const cashGivenNum = parseFloat(cashGiven) || 0;
  const changeRon = Math.max(0, cashGivenNum - totalRon);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      const payload = {
        items: cart.map((item) => ({
          id: item.product.id,
          quantity: item.quantity,
          priceCents: item.product.priceCents,
        })),
        paymentMethod,
        totalAmount: totalRon,
      };

      const res = await fetch("/api/seller/pos/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Eroare la finalizarea vânzării");
        return;
      }

      // Update local product stocks
      setProducts((prev) =>
        prev.map((p) => {
          const inCart = cart.find((item) => item.product.id === p.id);
          if (inCart) {
            return { ...p, stock: Math.max(0, p.stock - inCart.quantity) };
          }
          return p;
        })
      );

      setLastReceipt({
        receiptNumber: data.receiptNumber,
        date: new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
        items: [...cart],
        totalRon,
        tvaRon,
        paymentMethod,
        cashGiven: paymentMethod === "cash" ? cashGivenNum : null,
        changeRon: paymentMethod === "cash" ? changeRon : null,
      });

      clearCart();
    } catch (err: any) {
      alert(err.message || "Eroare de rețea");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] min-h-[600px]">
      {/* Left: Product Catalog & Fast Search */}
      <div className="flex-1 flex flex-col bg-white border border-[#E5E5E5] rounded-2xl shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-[#E5E5E5] bg-[#F7F7F8] flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 text-neutral-400 w-4 h-4" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Caută produs după denumire, cod sau scanează codul de bare..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E5E5E5] rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-500 font-bold bg-white px-3 py-2.5 rounded-xl border border-[#E5E5E5]">
            <Barcode className="w-4 h-4 text-violet-600" />
            Scaner Activ
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 content-start">
          {filteredProducts.map((product) => {
            const isOutOfStock = product.stock <= 0;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                disabled={isOutOfStock}
                className="flex flex-col text-left p-3 rounded-xl border border-[#E5E5E5] hover:border-violet-500 hover:shadow-md transition bg-white group disabled:opacity-50 disabled:pointer-events-none relative"
              >
                <div className="w-full aspect-square rounded-lg bg-neutral-100 overflow-hidden mb-2.5 relative">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-300">
                      <Package className="w-8 h-8" />
                    </div>
                  )}
                  {isOutOfStock ? (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold uppercase">
                      Stoc 0
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
                      Stoc: {product.stock}
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <h4 className="font-bold text-xs text-[#0D0D0D] line-clamp-2 leading-tight mb-1">
                    {product.title}
                  </h4>
                  {product.sku && (
                    <p className="text-[10px] text-neutral-400 font-mono mb-1">{product.sku}</p>
                  )}
                </div>

                <div className="pt-2 border-t border-neutral-100 flex items-center justify-between mt-auto">
                  <span className="font-black text-sm text-violet-600">
                    {(product.priceCents / 100).toFixed(2)} lei
                  </span>
                  <span className="w-6 h-6 rounded-full bg-neutral-100 group-hover:bg-violet-600 group-hover:text-white flex items-center justify-center text-xs font-bold transition">
                    +
                  </span>
                </div>
              </button>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full py-16 text-center text-neutral-400 text-sm">
              Niciun produs găsit pentru &ldquo;{searchQuery}&rdquo;.
            </div>
          )}
        </div>
      </div>

      {/* Right: Cash Register Ticket (POS Cart) */}
      <div className="w-full lg:w-96 flex flex-col bg-white border border-[#E5E5E5] rounded-2xl shadow-sm overflow-hidden">
        {/* Ticket Header */}
        <div className="p-4 border-b border-[#E5E5E5] bg-[#F7F7F8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-violet-600" />
            <span className="font-black text-sm text-[#0D0D0D]">Bon Vânzare Tejghie</span>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Golește
            </button>
          )}
        </div>

        {/* Ticket Items */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 divide-y divide-neutral-100">
          {cart.map((item) => (
            <div key={item.product.id} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xs text-[#0D0D0D] truncate">{item.product.title}</p>
                <p className="text-[11px] text-neutral-500">
                  {item.quantity} x {(item.product.priceCents / 100).toFixed(2)} lei
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.product.id, -1)}
                  className="w-6 h-6 rounded-md bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-xs font-bold"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="font-bold text-xs w-5 text-center">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.product.id, 1)}
                  className="w-6 h-6 rounded-md bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-xs font-bold"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.product.id)}
                  className="text-neutral-400 hover:text-red-600 ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {cart.length === 0 && (
            <div className="py-20 text-center text-neutral-400 text-xs">
              Scanează un cod sau selectează produse din stânga pentru a începe bonul.
            </div>
          )}
        </div>

        {/* Ticket Summary & Payment */}
        <div className="p-4 border-t border-[#E5E5E5] bg-[#F7F7F8] space-y-3.5">
          <div className="space-y-1 text-xs text-neutral-600">
            <div className="flex justify-between">
              <span>Baza impozabilă:</span>
              <span className="font-semibold">{subtotalRon.toFixed(2)} lei</span>
            </div>
            <div className="flex justify-between">
              <span>TVA (21%):</span>
              <span className="font-semibold">{tvaRon.toFixed(2)} lei</span>
            </div>
            <div className="flex justify-between text-base font-black text-[#0D0D0D] pt-1 border-t border-neutral-200">
              <span>TOTAL DE PLATĂ:</span>
              <span className="text-violet-700">{totalRon.toFixed(2)} lei</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                paymentMethod === "cash"
                  ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
                  : "bg-white text-neutral-700 border-[#E5E5E5]"
              }`}
            >
              <Banknote className="w-4 h-4" /> Numerar
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                paymentMethod === "card"
                  ? "bg-[#0D0D0D] text-white border-[#0D0D0D]"
                  : "bg-white text-neutral-700 border-[#E5E5E5]"
              }`}
            >
              <CreditCard className="w-4 h-4" /> Card POS
            </button>
          </div>

          {/* Cash Change Calculator */}
          {paymentMethod === "cash" && totalRon > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  placeholder="Sumă primită..."
                  className="w-full px-3 py-1.5 text-xs font-semibold border border-[#E5E5E5] rounded-lg bg-white"
                />
                {[50, 100, 200].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCashGiven(String(v))}
                    className="px-2 py-1.5 text-[11px] font-bold bg-white border border-[#E5E5E5] rounded-lg hover:bg-neutral-100 shrink-0"
                  >
                    {v}
                  </button>
                ))}
              </div>
              {cashGivenNum > 0 && (
                <div className="text-xs font-bold flex justify-between px-1 text-emerald-700">
                  <span>Rest de dat:</span>
                  <span>{changeRon.toFixed(2)} lei</span>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="button"
            disabled={cart.length === 0 || isProcessing}
            onClick={handleCheckout}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            {isProcessing ? "Se procesează..." : `Încasează ${totalRon.toFixed(2)} lei`}
          </button>
        </div>
      </div>

      {/* Receipt Modal after sale */}
      {lastReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-black text-[#0D0D0D]">Vânzare Finalizată!</h3>
              <p className="text-xs text-neutral-500 font-mono mt-0.5">Bon nr. {lastReceipt.receiptNumber}</p>
            </div>

            <div className="bg-neutral-50 p-3 rounded-xl text-left text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span>Data:</span>
                <span>{lastReceipt.date}</span>
              </div>
              <div className="flex justify-between">
                <span>Plată:</span>
                <span className="uppercase">{lastReceipt.paymentMethod}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-neutral-200">
                <span>Total:</span>
                <span>{lastReceipt.totalRon.toFixed(2)} lei</span>
              </div>
              {lastReceipt.changeRon !== null && (
                <div className="flex justify-between text-emerald-700">
                  <span>Rest:</span>
                  <span>{lastReceipt.changeRon.toFixed(2)} lei</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl border border-neutral-200 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-neutral-50"
              >
                <Printer className="w-4 h-4" /> Tipărește Bon
              </button>
              <button
                type="button"
                onClick={() => setLastReceipt(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#0D0D0D] text-white font-bold text-xs hover:bg-neutral-800"
              >
                Gata / Următorul
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
