"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Flame, Home, MessageCircle, Package, Search, Send, ShoppingCart, Star, Tag, Truck, X, Zap } from "lucide-react";
import ProductFeed from "./ProductFeed";
import { THEME, commerceBadgeClass } from "@/lib/ui/theme";

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
  commerceBadge?: string;
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

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);
  useEffect(() => { if (activeTab === "deals" && dealsProducts.length === 0 && !dealsLoading) loadDeals(); if (activeTab === "feed" && feedProducts.length === 0 && !feedLoading) loadFeed(); }, [activeTab]);

  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);

  function addToCart(product: ChatProduct) {
    setCartItems((prev) => {
      const idx = prev.findIndex((item) => item.product.id === product.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next; }
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
    setMessages((prev) => [...prev, userMsg]); setInput(""); setIsLoading(true); setActiveTab("chat");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg, sessionId, productContext: lastShownProducts.slice(0, 12), chatHistory: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Nu am putut căuta în Shopify.");
      if (data.intent === "add_to_cart") { const product = findProductForAI(data); if (product) addToCart(product); }
      const products = data.products || [];
      const bundleProducts = data.bundleProducts || [];
      if (products.length || bundleProducts.length) setLastShownProducts([...products, ...bundleProducts]);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.reply || "Am căutat în magazin.", products, bundleProducts, timestamp: new Date() }]);
      if (data.sessionId) setSessionId(data.sessionId);
    } catch (error: any) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: error?.message || "A apărut o eroare.", timestamp: new Date() }]);
    } finally { setIsLoading(false); }
  }

  async function loadDeals() { if (dealsLoading) return; setDealsLoading(true); try { const data = await fetch("/api/shopify-products?mode=trending&limit=50").then((r) => r.json()); setDealsProducts(data.products || []); } finally { setDealsLoading(false); } }
  async function loadFeed() { if (feedLoading) return; setFeedLoading(true); try { const data = await fetch("/api/shopify-products?mode=feed&limit=60").then((r) => r.json()); setFeedProducts(data.products || []); } finally { setFeedLoading(false); } }
  async function loadMoreFeed() { if (feedLoading) return; setFeedLoading(true); try { const data = await fetch(`/api/shopify-products?mode=feed&limit=30&_t=${Date.now()}`).then((r) => r.json()); setFeedProducts((prev) => { const existing = new Set(prev.map((p) => p.id)); const unique = (data.products || []).filter((p: ChatProduct) => !existing.has(p.id)); return [...prev, ...unique]; }); } finally { setFeedLoading(false); } }

  function updateQty(index: number, delta: number) { setCartItems((prev) => { const next = [...prev]; next[index] = { ...next[index], qty: Math.max(0, next[index].qty + delta) }; return next.filter((item) => item.qty > 0); }); }

  async function submitOrder() {
    if (cartItems.length === 0 || checkoutLoading) return;
    if (!checkoutForm.name || !checkoutForm.phone || !checkoutForm.address || !checkoutForm.city) { setToastMessage("Completează nume, telefon, adresă și oraș."); setTimeout(() => setToastMessage(""), 3000); return; }
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: cartItems.map((item) => ({ ...item.product, quantity: item.qty })), customer: checkoutForm }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "Nu am putut crea checkout-ul.");
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch (error: any) { setToastMessage(error?.message || "Eroare checkout."); setTimeout(() => setToastMessage(""), 4000); } finally { setCheckoutLoading(false); }
  }

  const ProductCard = ({ product, compact = false }: { product: ChatProduct; compact?: boolean }) => {
    const badge = product.commerceBadge || product.socialProofLabel;
    return (
      <div className={`${compact ? "w-48 shrink-0" : ""} overflow-hidden rounded-[1.6rem] ${THEME.classes.card}`} onClick={() => setSelectedProduct(product)}>
        <div className="relative h-40 bg-orange-50">
          {product.images?.[0] ? <img src={product.images[0]} alt={product.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Package className="text-orange-300" /></div>}
          {product.discountPercent > 0 && <span className={`absolute right-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-black ${THEME.classes.discountBadge}`}>-{product.discountPercent}%</span>}
          {badge && <span className={`absolute left-2 top-2 max-w-[80%] rounded-full px-2.5 py-1 text-[10px] font-black shadow ${commerceBadgeClass(badge)}`}>{badge}</span>}
        </div>
        <div className="p-3">
          <p className="line-clamp-2 text-sm font-black leading-tight text-slate-900">{product.title}</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-slate-500"><span className="text-amber-500">★ {product.rating?.toFixed?.(1) || "4.8"}</span><span>{product.orders || 0}+ comenzi</span></div>
          <div className="mt-2 flex items-end gap-2"><span className="text-xl font-black text-[#FF5A1F]">{product.price} lei</span>{product.oldPrice > product.price && <span className="text-xs text-slate-400 line-through">{product.oldPrice} lei</span>}</div>
          <button onClick={(e) => { e.stopPropagation(); addToCart(product); }} className={`mt-3 w-full rounded-2xl py-2.5 text-sm font-black ${THEME.classes.cartButton}`}>🛒 + Coș</button>
        </div>
      </div>
    );
  };

  const ProductCarousel = ({ title, products }: { title: string; products?: ChatProduct[] }) => {
    if (!products?.length) return null;
    return <div className="mt-4 text-left"><p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">{title}</p><div className="flex snap-x gap-3 overflow-x-auto pb-3">{products.map((p) => <div key={p.id} className="snap-start"><ProductCard product={p} compact /></div>)}</div></div>;
  };

  return (
    <main className={`min-h-screen ${THEME.classes.appBg}`}>
      <div className={`relative mx-auto min-h-screen max-w-lg ${THEME.classes.pageBg}`}>
        {activeTab !== "feed" && <header className="sticky top-0 z-30 border-b border-orange-100 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl"><div className="flex items-center justify-between"><button onClick={() => setActiveTab("home")} className="flex items-center gap-2"><span className={`grid h-10 w-10 place-items-center rounded-2xl text-sm font-black ${THEME.classes.primaryButton}`}>AI</span><div className="text-left"><h1 className="text-lg font-black text-slate-950">AICeVrei.ro</h1><p className="text-[10px] font-bold text-orange-500">AI shopping seller</p></div></button><button onClick={() => setActiveTab("cart")} className={`relative rounded-full p-2.5 ${THEME.classes.primaryButton}`}><ShoppingCart size={18} />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#16A34A] text-[10px] font-black text-white">{cartCount}</span>}</button></div></header>}

        <section className={activeTab === "feed" ? "h-screen" : "min-h-[calc(100vh-132px)] pb-36"}>
          {activeTab === "home" && <div className="px-4 pt-6"><div className={`rounded-[2rem] p-6 ${THEME.classes.heroCard}`}><div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-black text-orange-600"><Zap size={14} /> AI Seller + Bundle Builder</div><h2 className="text-4xl font-black leading-none tracking-tight text-slate-950">Spune-mi ce vrei și îți fac coșul perfect.</h2><p className="mt-3 text-sm font-semibold text-slate-500">Recomandări, bundle-uri și checkout rapid direct din Shopify.</p><div className={`mt-5 flex items-center gap-2 rounded-2xl p-3 ${THEME.classes.softInput}`}><Search size={20} className="text-orange-500" /><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} className="w-full bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400" placeholder="Ex: cadou pentru iubita" /></div><button onClick={() => sendMessage()} disabled={!input.trim() || isLoading} className={`mt-3 w-full rounded-2xl py-4 font-black disabled:opacity-50 ${THEME.classes.primaryButton}`}>🔥 Caută și fă bundle</button></div><div className="mt-5 grid grid-cols-3 gap-2">{QUICK_ACTIONS.map((a) => <button key={a.label} onClick={() => sendMessage(a.query)} className="rounded-2xl bg-white px-2 py-3 text-xs font-black text-slate-800 shadow-sm ring-1 ring-orange-100 active:scale-95">{a.label}</button>)}</div><ProductCarousel title="🔥 Trending acum" products={trendingProducts.slice(0, 10)} /></div>}
          {activeTab === "chat" && <div className="px-4 pt-4"><div className="space-y-4">{messages.map((m) => <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}><div className={`inline-block max-w-[88%] rounded-3xl px-4 py-3 text-sm font-semibold shadow-sm ${m.role === "user" ? "bg-[#FF5A1F] text-white" : "bg-white text-slate-900 ring-1 ring-orange-100"}`}>{m.role === "assistant" && <div className="mb-1 flex items-center gap-1 text-xs font-black text-orange-500"><Bot size={13} /> AI Seller</div>}<p className="whitespace-pre-wrap">{m.content}</p></div>{m.role === "assistant" && <><ProductCarousel title="🎯 Recomandate pentru tine" products={m.products} /><ProductCarousel title="🔥 Completează bundle-ul" products={m.bundleProducts} /></>}</div>)}{isLoading && <div className="rounded-2xl bg-white p-3 text-sm font-bold text-slate-500 shadow-sm">AI construiește recomandarea...</div>}<div ref={messagesEndRef} /></div></div>}
          {activeTab === "deals" && <div className="px-4 pt-4"><h2 className="mb-3 text-2xl font-black text-slate-950">🔥 Deals</h2>{dealsLoading ? <p className="py-20 text-center font-bold text-slate-400">Se încarcă...</p> : <div className="grid grid-cols-2 gap-3">{dealsProducts.map((p) => <ProductCard key={p.id} product={p} />)}</div>}</div>}
          {activeTab === "feed" && <ProductFeed products={feedProducts} onAddToCart={addToCart} onLoadMore={loadMoreFeed} onClose={() => setActiveTab("home")} isLoading={feedLoading} />}
          {activeTab === "cart" && <div className="px-4 pt-4"><h2 className="mb-4 text-2xl font-black text-slate-950">🛒 Coșul tău</h2>{cartItems.length === 0 ? <p className="py-20 text-center font-bold text-slate-400">Coșul este gol.</p> : <><div className="space-y-3">{cartItems.map((item, i) => <div key={item.product.id} className="flex gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-orange-100">{item.product.images?.[0] && <img src={item.product.images[0]} alt="" className="h-16 w-16 rounded-2xl object-cover" />}<div className="flex-1"><p className="line-clamp-2 text-sm font-black text-slate-900">{item.product.title}</p><p className="text-xs font-black text-[#FF5A1F]">{item.product.price * item.qty} lei</p></div><div className="flex items-center gap-2"><button onClick={() => updateQty(i, -1)} className="rounded-full bg-orange-50 px-2 font-black text-orange-600">-</button><span className="font-black">{item.qty}</span><button onClick={() => updateQty(i, 1)} className="rounded-full bg-orange-50 px-2 font-black text-orange-600">+</button></div></div>)}</div><div className="mt-5 rounded-3xl bg-white p-4 shadow-lg ring-1 ring-orange-100"><div className="flex justify-between text-xl font-black"><span>Total</span><span className="text-[#FF5A1F]">{cartTotal} lei</span></div><button onClick={() => setShowCheckoutForm(true)} className={`mt-4 w-full rounded-2xl py-4 font-black ${THEME.classes.cartButton}`}>Finalizează comanda</button></div></>}</div>}
        </section>

        {activeTab !== "feed" && <div className="fixed bottom-16 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 border-t border-orange-100 bg-white/95 px-3 py-2 shadow-[0_-10px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl"><div className={`flex gap-2 rounded-2xl p-2 ${THEME.classes.softInput}`}><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} className="flex-1 bg-transparent px-2 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400" placeholder="Scrie ce cauți..." /><button onClick={() => sendMessage()} disabled={!input.trim() || isLoading} className={`grid h-10 w-10 place-items-center rounded-2xl disabled:opacity-40 ${THEME.classes.primaryButton}`}><Send size={16} /></button></div></div>}
        {activeTab !== "feed" && <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 border-t border-orange-100 bg-white/95 px-4 py-3 shadow-[0_-6px_30px_rgba(15,23,42,0.06)]"><div className="flex justify-around text-[10px] font-black text-slate-400"><NavBtn icon={<Home size={18} />} label="Acasă" active={activeTab === "home"} onClick={() => setActiveTab("home")} /><NavBtn icon={<Flame size={18} />} label="Feed" active={activeTab === "feed"} onClick={() => setActiveTab("feed")} /><NavBtn icon={<MessageCircle size={18} />} label="Chat" active={activeTab === "chat"} onClick={() => setActiveTab("chat")} /><NavBtn icon={<Tag size={18} />} label="Deals" active={activeTab === "deals"} onClick={() => setActiveTab("deals")} /><NavBtn icon={<ShoppingCart size={18} />} label={`Coș ${cartCount ? `(${cartCount})` : ""}`} active={activeTab === "cart"} onClick={() => setActiveTab("cart")} /></div></nav>}

        {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={() => addToCart(selectedProduct)} />}
        {showCheckoutForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowCheckoutForm(false)}><div className="w-full max-w-lg rounded-t-[2rem] bg-white p-5 text-slate-950" onClick={(e) => e.stopPropagation()}><div className="mb-4 flex justify-between"><h2 className="text-lg font-black">Finalizează comanda</h2><button onClick={() => setShowCheckoutForm(false)}><X size={18} /></button></div><div className="space-y-3">{["name", "phone", "email", "address", "city", "county"].map((field) => <input key={field} value={(checkoutForm as any)[field]} onChange={(e) => setCheckoutForm((f) => ({ ...f, [field]: e.target.value }))} placeholder={field === "name" ? "Nume complet *" : field === "phone" ? "Telefon *" : field === "address" ? "Adresă *" : field === "city" ? "Oraș *" : field === "county" ? "Județ" : "Email"} className="w-full rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold outline-none" />)}</div><button onClick={submitOrder} disabled={checkoutLoading} className={`mt-5 w-full rounded-2xl py-4 font-black disabled:opacity-50 ${THEME.classes.cartButton}`}>{checkoutLoading ? "Se procesează..." : `Plătește ${cartTotal} lei`}</button></div></div>}
        {toastMessage && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#16A34A] px-4 py-2 text-sm font-black text-white shadow-xl">{toastMessage}</div>}
      </div>
    </main>
  );
}

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button onClick={onClick} className={`flex flex-col items-center gap-0.5 ${active ? "text-[#FF5A1F]" : "text-slate-400"}`}>{icon}{label}</button>; }

function ProductModal({ product, onClose, onAddToCart }: { product: ChatProduct; onClose: () => void; onAddToCart: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}><div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 text-slate-950" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex justify-between"><span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-600">{product.category}</span><button onClick={onClose}><X size={18} /></button></div>{product.images?.[0] && <img src={product.images[0]} alt={product.title} className="h-64 w-full rounded-3xl object-cover" />}<h2 className="mt-4 text-2xl font-black">{product.title}</h2><div className="mt-2 flex gap-3 text-sm font-bold text-slate-500"><span className="text-amber-500"><Star size={14} className="inline" fill="currentColor" /> {product.rating}</span><span>{product.orders}+ comenzi</span><span><Truck size={14} className="inline" /> {product.deliveryDays} zile</span></div><div className="mt-3"><span className="text-3xl font-black text-[#FF5A1F]">{product.price} lei</span>{product.oldPrice > product.price && <span className="ml-2 text-slate-400 line-through">{product.oldPrice} lei</span>}</div><p className="mt-4 text-sm font-semibold leading-relaxed text-slate-600">{product.description}</p>{product.benefits?.length > 0 && <div className="mt-4 space-y-2">{product.benefits.map((b, i) => <div key={i} className="rounded-2xl bg-orange-50 px-3 py-2 text-sm font-bold text-slate-700">✓ {b}</div>)}</div>}<button onClick={onAddToCart} className={`mt-5 w-full rounded-2xl py-4 font-black ${THEME.classes.cartButton}`}>🛒 Adaugă în coș — {product.price} lei</button></div></div>;
}
