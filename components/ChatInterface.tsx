"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Flame, Home, MessageCircle, Package, Search, Send, ShoppingCart, Star, Tag, Truck, X, Zap } from "lucide-react";
import ProductFeed from "./ProductFeed";

type ChatProduct = {
  id: string;
  title: string;
  description: string;
  benefits: string[];
  dealLabel: string;
  whyBuy: string;
  warnings: string[];
  price: number;
  oldPrice: number;
  discountPercent: number;
  rating: number;
  orders: number;
  deliveryDays: number;
  images: string[];
  category: string;
  gradient: string;
  qualityScore: number;
  viewers?: number;
  cartAdds?: number;
  likes?: number;
  commentCount?: number;
  socialProofLabel?: string;
  variantId?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: ChatProduct[];
  bundleProducts?: ChatProduct[];
  timestamp: Date;
};

type CartItem = { product: ChatProduct; qty: number };

type Tab = "home" | "chat" | "deals" | "feed" | "cart";

const QUICK_ACTIONS = [
  { label: "🎁 Cadou", query: "cadou pentru iubita" },
  { label: "👗 Outfit", query: "outfit elegant femei" },
  { label: "💎 Bijuterii", query: "bijuterii elegante" },
  { label: "💄 Beauty", query: "skincare beauty" },
  { label: "🏠 Casă", query: "produse utile pentru casa" },
  { label: "🔥 Sub 100", query: "produse bune sub 100 lei" },
];

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [sessionId, setSessionId] = useState("");
  const [trendingProducts, setTrendingProducts] = useState<ChatProduct[]>([]);
  const [dealsProducts, setDealsProducts] = useState<ChatProduct[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [feedProducts, setFeedProducts] = useState<ChatProduct[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ChatProduct | null>(null);
  const [lastShownProducts, setLastShownProducts] = useState<ChatProduct[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [toastMessage, setToastMessage] = useState("");
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: "", email: "", phone: "", address: "", city: "", county: "" });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(crypto.randomUUID());
    fetch("/api/shopify-products?mode=trending&limit=20")
      .then((r) => r.json())
      .then((d) => setTrendingProducts(d.products || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (activeTab === "deals" && dealsProducts.length === 0 && !dealsLoading) loadDeals();
    if (activeTab === "feed" && feedProducts.length === 0 && !feedLoading) loadFeed();
  }, [activeTab]);

  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);

  function addToCart(product: ChatProduct) {
    setCartItems((prev) => {
      const idx = prev.findIndex((item) => item.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { product, qty: 1 }];
    });
    setSelectedProduct(null);
    setToastMessage(`🛒 ${product.title.slice(0, 24)} adăugat în coș`);
    setTimeout(() => setToastMessage(""), 2500);
  }

  function findProductForAI(data: any) {
    const all = [...lastShownProducts, ...(data.products || []), ...(data.bundleProducts || [])];
    if (data.productId) return all.find((p) => p.id === data.productId);
    if (data.productTitle) {
      const needle = String(data.productTitle).toLowerCase();
      return all.find((p) => p.title.toLowerCase().includes(needle));
    }
    return all.length === 1 ? all[0] : null;
  }

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: msg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setActiveTab("chat");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          sessionId,
          productContext: lastShownProducts.slice(0, 12),
          chatHistory: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Nu am putut căuta în Shopify.");

      if (data.intent === "add_to_cart") {
        const product = findProductForAI(data);
        if (product) addToCart(product);
      }

      const products = data.products || [];
      const bundleProducts = data.bundleProducts || [];
      if (products.length || bundleProducts.length) setLastShownProducts([...products, ...bundleProducts]);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply || "Am căutat în magazin.",
          products,
          bundleProducts,
          timestamp: new Date(),
        },
      ]);
      if (data.sessionId) setSessionId(data.sessionId);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: error?.message || "A apărut o eroare.", timestamp: new Date() },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDeals() {
    if (dealsLoading) return;
    setDealsLoading(true);
    try {
      const res = await fetch("/api/shopify-products?mode=trending&limit=50");
      const data = await res.json();
      setDealsProducts(data.products || []);
    } finally {
      setDealsLoading(false);
    }
  }

  async function loadFeed() {
    if (feedLoading) return;
    setFeedLoading(true);
    try {
      const res = await fetch("/api/shopify-products?mode=feed&limit=60");
      const data = await res.json();
      setFeedProducts(data.products || []);
    } finally {
      setFeedLoading(false);
    }
  }

  async function loadMoreFeed() {
    if (feedLoading) return;
    setFeedLoading(true);
    try {
      const res = await fetch(`/api/shopify-products?mode=feed&limit=30&_t=${Date.now()}`);
      const data = await res.json();
      setFeedProducts((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        const unique = (data.products || []).filter((p: ChatProduct) => !existing.has(p.id));
        return [...prev, ...unique];
      });
    } finally {
      setFeedLoading(false);
    }
  }

  function updateQty(index: number, delta: number) {
    setCartItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], qty: Math.max(0, next[index].qty + delta) };
      return next.filter((item) => item.qty > 0);
    });
  }

  async function submitOrder() {
    if (cartItems.length === 0 || checkoutLoading) return;
    if (!checkoutForm.name || !checkoutForm.phone || !checkoutForm.address || !checkoutForm.city) {
      setToastMessage("Completează nume, telefon, adresă și oraș.");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }

    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: cartItems.map((item) => ({ ...item.product, quantity: item.qty })),
          customer: checkoutForm,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "Nu am putut crea checkout-ul.");
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch (error: any) {
      setToastMessage(error?.message || "Eroare checkout.");
      setTimeout(() => setToastMessage(""), 4000);
    } finally {
      setCheckoutLoading(false);
    }
  }

  const ProductCard = ({ product, compact = false }: { product: ChatProduct; compact?: boolean }) => (
    <div className={`${compact ? "w-44 shrink-0" : ""} overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]`} onClick={() => setSelectedProduct(product)}>
      <div className="relative h-36 bg-white/5">
        {product.images?.[0] ? <img src={product.images[0]} alt={product.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Package className="text-white/20" /></div>}
        {product.discountPercent > 0 && <span className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-1 text-[10px] font-black">-{product.discountPercent}%</span>}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-bold text-white/90">{product.title}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
          <span className="text-amber-300">★ {product.rating?.toFixed?.(1) || "4.8"}</span>
          <span>{product.orders || 0}+ comenzi</span>
        </div>
        {product.socialProofLabel && <p className="mt-1 text-[11px] font-bold text-emerald-300">{product.socialProofLabel}</p>}
        <div className="mt-2 flex items-end gap-2">
          <span className="text-lg font-black text-emerald-400">{product.price} lei</span>
          {product.oldPrice > product.price && <span className="text-xs text-white/30 line-through">{product.oldPrice} lei</span>}
        </div>
        <button onClick={(e) => { e.stopPropagation(); addToCart(product); }} className="mt-3 w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 py-2 text-sm font-black text-black">+ Coș</button>
      </div>
    </div>
  );

  const ProductCarousel = ({ title, products }: { title: string; products?: ChatProduct[] }) => {
    if (!products?.length) return null;
    return (
      <div className="mt-3 text-left">
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-white/40">{title}</p>
        <div className="flex snap-x gap-3 overflow-x-auto pb-2">
          {products.map((p) => (
            <div key={p.id} className="snap-start">
              <ProductCard product={p} compact />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="relative mx-auto min-h-screen max-w-lg bg-[radial-gradient(circle_at_top,#1a0a3e_0,#050507_50%)]">
        {activeTab !== "feed" && (
          <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <button onClick={() => setActiveTab("home")} className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-black text-black">AI</span>
                <div className="text-left"><h1 className="text-lg font-black">AICeVrei.ro</h1><p className="text-[10px] text-white/40">AI sales agent Shopify</p></div>
              </button>
              <button onClick={() => setActiveTab("cart")} className="relative rounded-full bg-white/10 p-2.5">
                <ShoppingCart size={18} />
                {cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-violet-500 text-[10px] font-black">{cartCount}</span>}
              </button>
            </div>
          </header>
        )}

        <section className={activeTab === "feed" ? "h-screen" : "min-h-[calc(100vh-132px)] pb-36"}>
          {activeTab === "home" && (
            <div className="px-4 pt-8">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-300"><Zap size={14} /> AI Sales Agent</div>
                <h2 className="text-4xl font-black leading-none">Spune-mi ce vrei și îți fac bundle-ul perfect.</h2>
                <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-3">
                  <Search size={20} className="text-white/40" />
                  <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} className="w-full bg-transparent text-sm outline-none" placeholder="Ex: cadou pentru iubita" />
                </div>
                <button onClick={() => sendMessage()} disabled={!input.trim() || isLoading} className="mt-3 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 py-4 font-black text-black disabled:opacity-50">Caută și fă bundle</button>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {QUICK_ACTIONS.map((a) => <button key={a.label} onClick={() => sendMessage(a.query)} className="rounded-xl border border-white/10 bg-white/[0.06] px-2 py-3 text-xs font-bold text-white/80">{a.label}</button>)}
              </div>
              <ProductCarousel title="🔥 Trending acum" products={trendingProducts.slice(0, 10)} />
            </div>
          )}

          {activeTab === "chat" && (
            <div className="px-4 pt-4">
              <div className="space-y-4">
                {messages.map((m) => (
                  <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
                    <div className={`inline-block max-w-[88%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-gradient-to-r from-violet-500 to-cyan-400 text-black" : "border border-white/10 bg-white/[0.06]"}`}>
                      {m.role === "assistant" && <div className="mb-1 flex items-center gap-1 text-xs font-bold text-violet-300"><Bot size={13} /> AI Seller</div>}
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                    {m.role === "assistant" && (
                      <>
                        <ProductCarousel title="🎯 Recomandate pentru tine" products={m.products} />
                        <ProductCarousel title="🔥 Completează bundle-ul" products={m.bundleProducts} />
                      </>
                    )}
                  </div>
                ))}
                {isLoading && <div className="text-sm text-white/40">AI construiește recomandarea...</div>}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {activeTab === "deals" && <div className="px-4 pt-4"><h2 className="mb-3 text-2xl font-black">🔥 Deals</h2>{dealsLoading ? <p className="py-20 text-center text-white/40">Se încarcă...</p> : <div className="grid grid-cols-2 gap-3">{dealsProducts.map((p) => <ProductCard key={p.id} product={p} />)}</div>}</div>}
          {activeTab === "feed" && <ProductFeed products={feedProducts} onAddToCart={addToCart} onLoadMore={loadMoreFeed} onClose={() => setActiveTab("home")} isLoading={feedLoading} />}
          {activeTab === "cart" && <div className="px-4 pt-4"><h2 className="mb-4 text-2xl font-black">🛒 Coșul tău</h2>{cartItems.length === 0 ? <p className="py-20 text-center text-white/40">Coșul este gol.</p> : <><div className="space-y-3">{cartItems.map((item, i) => <div key={item.product.id} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">{item.product.images?.[0] && <img src={item.product.images[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />}<div className="flex-1"><p className="line-clamp-2 text-sm font-bold">{item.product.title}</p><p className="text-xs text-emerald-300">{item.product.price * item.qty} lei</p></div><div className="flex items-center gap-2"><button onClick={() => updateQty(i, -1)} className="rounded bg-white/10 px-2">-</button><span>{item.qty}</span><button onClick={() => updateQty(i, 1)} className="rounded bg-white/10 px-2">+</button></div></div>)}</div><div className="mt-5 rounded-2xl bg-white/[0.06] p-4"><div className="flex justify-between text-xl font-black"><span>Total</span><span className="text-emerald-400">{cartTotal} lei</span></div><button onClick={() => setShowCheckoutForm(true)} className="mt-4 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-400 py-4 font-black text-black">Finalizează comanda</button></div></>}</div>}
        </section>

        {activeTab !== "feed" && <div className="fixed bottom-16 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 border-t border-white/10 bg-black/90 px-3 py-2"><div className="flex gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-2"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} className="flex-1 bg-transparent px-2 text-sm outline-none" placeholder="Scrie ce cauți..." /><button onClick={() => sendMessage()} disabled={!input.trim() || isLoading} className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-black disabled:opacity-40"><Send size={16} /></button></div></div>}
        {activeTab !== "feed" && <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 border-t border-white/10 bg-black/95 px-4 py-3"><div className="flex justify-around text-[10px] text-white/40"><NavBtn icon={<Home size={18} />} label="Acasă" active={activeTab === "home"} onClick={() => setActiveTab("home")} /><NavBtn icon={<Flame size={18} />} label="Feed" active={activeTab === "feed"} onClick={() => setActiveTab("feed")} /><NavBtn icon={<MessageCircle size={18} />} label="Chat" active={activeTab === "chat"} onClick={() => setActiveTab("chat")} /><NavBtn icon={<Tag size={18} />} label="Deals" active={activeTab === "deals"} onClick={() => setActiveTab("deals")} /><NavBtn icon={<ShoppingCart size={18} />} label={`Coș ${cartCount ? `(${cartCount})` : ""}`} active={activeTab === "cart"} onClick={() => setActiveTab("cart")} /></div></nav>}

        {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={() => addToCart(selectedProduct)} />}
        {showCheckoutForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={() => setShowCheckoutForm(false)}><div className="w-full max-w-lg rounded-t-[2rem] bg-[#0b0b12] p-5" onClick={(e) => e.stopPropagation()}><div className="mb-4 flex justify-between"><h2 className="text-lg font-black">Finalizează comanda</h2><button onClick={() => setShowCheckoutForm(false)}><X size={18} /></button></div><div className="space-y-3">{["name", "phone", "email", "address", "city", "county"].map((field) => <input key={field} value={(checkoutForm as any)[field]} onChange={(e) => setCheckoutForm((f) => ({ ...f, [field]: e.target.value }))} placeholder={field === "name" ? "Nume complet *" : field === "phone" ? "Telefon *" : field === "address" ? "Adresă *" : field === "city" ? "Oraș *" : field === "county" ? "Județ" : "Email"} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none" />)}</div><button onClick={submitOrder} disabled={checkoutLoading} className="mt-5 w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 py-4 font-black text-black disabled:opacity-50">{checkoutLoading ? "Se procesează..." : `Plătește ${cartTotal} lei`}</button></div></div>}
        {toastMessage && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-black text-black">{toastMessage}</div>}
      </div>
    </main>
  );
}

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex flex-col items-center gap-0.5 ${active ? "text-white" : "text-white/40"}`}>{icon}{label}</button>;
}

function ProductModal({ product, onClose, onAddToCart }: { product: ChatProduct; onClose: () => void; onAddToCart: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}><div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#0b0b12] p-5" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex justify-between"><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{product.category}</span><button onClick={onClose}><X size={18} /></button></div>{product.images?.[0] && <img src={product.images[0]} alt={product.title} className="h-56 w-full rounded-2xl object-cover" />}<h2 className="mt-4 text-2xl font-black">{product.title}</h2><div className="mt-2 flex gap-3 text-sm text-white/50"><span className="text-amber-300"><Star size={14} className="inline" fill="currentColor" /> {product.rating}</span><span>{product.orders}+ comenzi</span><span><Truck size={14} className="inline" /> {product.deliveryDays} zile</span></div><div className="mt-3"><span className="text-3xl font-black">{product.price} lei</span>{product.oldPrice > product.price && <span className="ml-2 text-white/30 line-through">{product.oldPrice} lei</span>}</div><p className="mt-4 text-sm leading-relaxed text-white/70">{product.description}</p>{product.benefits?.length > 0 && <div className="mt-4 space-y-2">{product.benefits.map((b, i) => <div key={i} className="rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white/70">✓ {b}</div>)}</div>}<button onClick={onAddToCart} className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 py-4 font-black text-black">Adaugă în coș — {product.price} lei</button></div></div>;
}
