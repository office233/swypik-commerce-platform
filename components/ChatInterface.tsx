"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot, ChevronDown, MessageCircle, Package, Search,
  Send, ShoppingBag, ShoppingCart, Sparkles, Star,
  Truck, X, Zap, Home, Tag, User,
} from "lucide-react";

/* ─── Types ─── */
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
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: ChatProduct[];
  timestamp: Date;
};

type CartItem = { product: ChatProduct; qty: number };

/* ─── Quick action categories ─── */
const QUICK_ACTIONS = [
  { label: "🎧 Căști", displayMsg: "Vreau căști wireless", cjQuery: "wireless earbuds bluetooth 5.3 ANC" },
  { label: "📱 Huse", displayMsg: "Huse telefon", cjQuery: "phone case iPhone Samsung silicone" },
  { label: "💄 Beauty", displayMsg: "Produse beauty", cjQuery: "face serum vitamin C hyaluronic acid" },
  { label: "🏋️ Fitness", displayMsg: "Echipament fitness", cjQuery: "resistance bands gym equipment home" },
  { label: "🚗 Auto", displayMsg: "Accesorii auto", cjQuery: "car phone holder mount magnetic" },
  { label: "🏠 Casă", displayMsg: "Gadgeturi casă", cjQuery: "kitchen gadget organizer storage tool" },
  { label: "💡 LED", displayMsg: "Lumini LED", cjQuery: "LED strip light RGB bedroom decor" },
  { label: "⌚ Ceasuri", displayMsg: "Ceasuri smart", cjQuery: "smartwatch men women fitness tracker" },
  { label: "🎮 Gaming", displayMsg: "Accesorii gaming", cjQuery: "gaming mouse pad RGB keyboard" },
  { label: "🎁 Cadouri", displayMsg: "Cadouri unice", cjQuery: "gift set women men birthday unique" },
  { label: "👕 Fashion", displayMsg: "Haine trendy", cjQuery: "t-shirt men streetwear summer" },
  { label: "📷 Tech", displayMsg: "Gadgeturi tech", cjQuery: "USB C hub adapter charger fast" },
];

/* ─── Gradient map for product cards ─── */
const CATEGORY_ICONS: Record<string, any> = {
  tech: "🎧",
  beauty: "💄",
  fitness: "🏋️",
  auto: "🚗",
  casa: "🏠",
  gadgets: "🔌",
  fashion: "👕",
  home: "🏠",
  electronics: "📱",
  sport: "⚽",
  gaming: "🎮",
  jewelry: "💎",
  led: "💡",
  phone: "📱",
  camera: "📷",
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ChatProduct | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [activeTab, setActiveTab] = useState<"home" | "chat" | "deals" | "cart">("home");
  const [dealsProducts, setDealsProducts] = useState<ChatProduct[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [browseProducts, setBrowseProducts] = useState<ChatProduct[]>([]);
  const [browseTitle, setBrowseTitle] = useState("");
  const [trendingProducts, setTrendingProducts] = useState<ChatProduct[]>([]);
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });
  const [toastMessage, setToastMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSessionId(crypto.randomUUID());
    // Preload trending products for homepage
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "trending", sessionId: "preload", directCjQuery: "smartphone accessories USB LED gadget" }),
    }).then(r => r.json()).then(d => setTrendingProducts(d.products || [])).catch(() => {});
  }, []);

  // Countdown timer — resets at midnight
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      const diff = end.getTime() - now.getTime();
      setCountdown({ h: Math.floor(diff / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000) });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /* ─── Send message ─── */
  async function sendMessage(text?: string, directCjQuery?: string) {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: new Date(),
    };

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
          directCjQuery: directCjQuery || undefined,
          chatHistory: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "Hmm, nu am înțeles. Poți reformula?",
        products: data.products,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMsg]);
      if (data.sessionId) setSessionId(data.sessionId);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Oops! Ceva nu a mers bine. Încearcă din nou.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: "", email: "", phone: "", address: "", city: "", county: "" });
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  function addToCart(product: ChatProduct) {
    setCartItems((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n; }
      return [...prev, { product, qty: 1 }];
    });
    setSelectedProduct(null);
    setToastMessage(`🛒 ${product.title.substring(0, 20)}... adăugat!`);
    setTimeout(() => setToastMessage(""), 3000);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `🛒 **${product.title}** — ${product.price} lei adăugat în coș!\nApasă pe **Coș** pentru a finaliza.`, timestamp: new Date() }]);
  }


  async function addToStore(product: ChatProduct) {
    setToastMessage(`Uploading "${product.title.substring(0, 25)}..." to store...`);
    try {
      const res = await fetch("/api/products/add-to-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          title: product.title,
          description: product.description || product.title,
          price: product.price,
          oldPrice: product.oldPrice || product.price,
          category: product.category || "general",
          images: product.images || [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage(`Product added to Shopify!`);
      } else {
        setToastMessage(`Error: ${data.error || "Failed to add"}`);
      }
    } catch {
      setToastMessage("Network error!");
    }
    setTimeout(() => setToastMessage(""), 4000);
  }

  function updateQty(index: number, delta: number) {
    setCartItems((prev) => {
      const n = [...prev];
      n[index] = { ...n[index], qty: Math.max(0, n[index].qty + delta) };
      return n.filter((c) => c.qty > 0);
    });
  }

  function removeFromCart(index: number) {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  }

  const cartTotal = cartItems.reduce((sum, c) => sum + c.product.price * c.qty, 0);
  const cartCount = cartItems.reduce((sum, c) => sum + c.qty, 0);

  /* ─── Load Deals ─── */
  async function loadDeals() {
    if (dealsProducts.length > 0 || dealsLoading) return;
    setDealsLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "deals", sessionId, directCjQuery: "wireless earbuds bluetooth portable charger USB gadget" }),
      });
      const data = await res.json();
      setDealsProducts(data.products || []);
    } catch {} finally { setDealsLoading(false); }
  }

  /* ─── Load Category Browse ─── */
  async function loadCategory(label: string, query: string) {
    setBrowseTitle(label);
    setBrowseProducts([]);
    setActiveTab("deals");
    setDealsLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: label, sessionId, directCjQuery: query }),
      });
      const data = await res.json();
      setBrowseProducts(data.products || []);
    } catch {} finally { setDealsLoading(false); }
  }

  async function submitOrder() {
    if (cartItems.length === 0) return;
    if (!checkoutForm.name || !checkoutForm.phone || !checkoutForm.address || !checkoutForm.city) {
      alert("Completează toate câmpurile obligatorii!");
      return;
    }

    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: cartItems.flatMap((ci) => Array(ci.qty).fill(ci.product)),
          customer: checkoutForm,
        }),
      });
      const data = await res.json();

      setCartItems([]);
      setShowCheckoutForm(false);
      setCheckoutForm({ name: "", email: "", phone: "", address: "", city: "", county: "" });
      setActiveTab("chat");

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.checkoutUrl ? `✅ Comanda (${cartTotal} lei) creată!\n👉 [Plătește acum](${data.checkoutUrl})` : `✅ Comanda înregistrată! Te contactăm pe ${checkoutForm.phone}.`,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `❌ Eroare la plasarea comenzii. Încearcă din nou.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setCheckoutLoading(false);
    }
  }

  /* ─── Render home/welcome screen ─── */
  function renderHome() {
    return (
      <div className="flex flex-col items-center px-4 pt-8 pb-32 animate-fadeIn">
        {/* Hero card */}
        <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-glow backdrop-blur-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            <Sparkles size={14} /> Powered by AI
          </div>
          <h1 className="text-4xl font-black leading-[0.95] tracking-tight">
            Spune-mi ce vrei și îți găsesc{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              oferta perfectă.
            </span>
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Caut produse, compar prețuri, explic detalii — totul într-o conversație.
          </p>

          {/* Search box */}
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-3">
            <Search className="text-white/40" size={20} />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
              placeholder='Ex: "căști wireless sub 150 lei"'
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-4 font-black text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            Caută cu AI <Zap size={18} />
          </button>
        </div>

        {/* Quick actions — Category grid */}
        <div className="mt-5 w-full">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Categorii populare</p>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => loadCategory(action.label, action.cjQuery)}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white/80 transition-all hover:bg-white/10 hover:scale-105 active:scale-95"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Trending Products on Homepage */}
        {trendingProducts.length > 0 && (
          <div className="mt-6 w-full">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">🔥 Trending acum</p>
              <button onClick={() => { setActiveTab("deals"); loadDeals(); }} className="text-[10px] text-violet-400 font-bold">Vezi toate →</button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {trendingProducts.slice(0, 8).map((p) => (
                <div key={p.id} onClick={() => setSelectedProduct(p)} className="flex-shrink-0 w-36 cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden transition hover:scale-105">
                  <div className="relative h-28">
                    {p.images?.[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center bg-violet-900/20"><Package className="text-white/20" size={24} /></div>}
                    {p.discountPercent > 0 && <span className="absolute top-1 right-1 rounded bg-red-500 px-1 py-0.5 text-[8px] font-black text-white">-{p.discountPercent}%</span>}
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] text-white/70 line-clamp-2 leading-tight">{p.title}</p>
                    <p className="mt-1 text-sm font-black text-emerald-400">{p.price} lei</p>
                    <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} className="mt-1.5 w-full rounded-lg bg-violet-500/20 py-1 text-[9px] font-bold text-violet-300">+ Coș</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trust strip */}
        <div className="mt-6 w-full grid grid-cols-4 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center"><p className="text-lg">🔒</p><p className="text-[9px] text-white/40 mt-0.5">Plată securizată</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center"><p className="text-lg">🚚</p><p className="text-[9px] text-white/40 mt-0.5">Transport gratuit</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center"><p className="text-lg">📦</p><p className="text-[9px] text-white/40 mt-0.5">Retur 30 zile</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-center"><p className="text-lg">✅</p><p className="text-[9px] text-white/40 mt-0.5">Garanție</p></div>
        </div>
      </div>
    );
  }

  /* ─── Render chat messages ─── */
  function renderChat() {
    if (messages.length === 0) return (
      <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
        <MessageCircle className="mb-4 text-white/20" size={48} />
        <p className="text-white/40 text-sm">Scrie un mesaj pentru a începe o conversație.</p>
      </div>
    );

    return (
      <div className="flex flex-col gap-4 px-4 pt-4 pb-32 animate-fadeIn">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] ${msg.role === "user" ? "order-1" : "order-1"}`}>
              {/* Message bubble */}
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed animate-slideUp ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-black font-medium"
                    : "border border-white/10 bg-white/[0.06] text-white/90 backdrop-blur-xl"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-violet-300">
                    <Bot size={14} /> AI
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>

              {/* Product cards */}
              {msg.products && msg.products.length > 0 && (
                <div className="mt-3 space-y-3">
                  {msg.products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onViewDetails={() => setSelectedProduct(product)}
                      onAddToCart={() => addToCart(product)} onAddToStore={() => addToStore(product)}
                    />
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <p className={`mt-1 text-[10px] text-white/25 ${msg.role === "user" ? "text-right" : ""}`}>
                {msg.timestamp.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>
    );
  }


  /* ─── Render Deals / Browse Tab ─── */
  function renderDealsTab() {
    const products = browseProducts.length > 0 ? browseProducts : dealsProducts;
    const title = browseTitle || "🔥 Flash Sale";
    if (dealsLoading) return (
      <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
        <p className="mt-3 text-sm text-white/40">Se încarcă ofertele...</p>
      </div>
    );
    if (products.length === 0) {
      loadDeals();
      return <div className="py-20 text-center text-white/40 text-sm">Se încarcă ofertele...</div>;
    }
    return (
      <div className="px-4 pt-4 pb-36 animate-fadeIn">
        {!browseTitle && (
          <div className="mb-4 rounded-xl bg-gradient-to-r from-red-600/90 to-orange-500/90 p-3">
            <p className="text-xs font-black text-white text-center animate-pulse">⚡ OFERTE LIMITATE — Se termină în:</p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="rounded bg-black/30 px-2 py-1 text-sm font-black text-white">{String(countdown.h).padStart(2,'0')}h</span>
              <span className="text-white font-black">:</span>
              <span className="rounded bg-black/30 px-2 py-1 text-sm font-black text-white">{String(countdown.m).padStart(2,'0')}m</span>
              <span className="text-white font-black">:</span>
              <span className="rounded bg-black/30 px-2 py-1 text-sm font-black text-white">{String(countdown.s).padStart(2,'0')}s</span>
            </div>
            <p className="text-[10px] text-white/80 mt-1 text-center">{products.length} produse • Stoc limitat</p>
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-black">{title}</h2>
          {browseProducts.length > 0 && <button onClick={() => { setBrowseProducts([]); setBrowseTitle(""); }} className="text-xs text-violet-400 font-bold">← Înapoi</button>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {products.map((p, idx) => (
            <div key={p.id} onClick={() => setSelectedProduct(p)} className="cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden transition hover:border-violet-500/30 hover:scale-[1.02] active:scale-95">
              <div className="relative h-32 bg-gradient-to-br from-violet-900/30 to-black">
                {p.images?.[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} /> : <div className="grid h-full place-items-center"><Package className="text-white/20" size={32} /></div>}
                {p.rating > 0 && <span className="absolute top-2 left-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">⭐ {p.rating.toFixed(1)}</span>}
                {p.discountPercent > 0 && <span className="absolute top-2 right-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">-{p.discountPercent}%</span>}
                {idx < 3 && <span className="absolute bottom-2 left-2 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-black">BEST SELLER</span>}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-semibold text-white/80 line-clamp-2 leading-tight">{p.title}</p>
                <div className="mt-1.5 flex items-end gap-1.5">
                  <span className="text-base font-black text-emerald-400">{p.price} lei</span>
                  <span className="text-[10px] text-white/30 line-through">{p.oldPrice} lei</span>
                </div>
                <p className="mt-1 text-[9px] text-amber-300/70">🚚 Gratuit • 👁 {Math.floor(Math.random() * 30 + 5)} se uită acum</p>
                <button onClick={(e) => { e.stopPropagation(); addToCart(p); }} className="mt-2 w-full rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 py-1.5 text-[11px] font-black text-black">🛒 Adaugă în coș</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── Render Cart — High Conversion ─── */
  function renderCartTab() {
    return (
      <div className="px-4 pt-4 pb-36 animate-fadeIn">
        <h2 className="text-2xl font-black mb-2">🛒 Coșul tău</h2>
        {cartItems.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingCart className="mx-auto mb-4 text-white/20" size={48} />
            <p className="text-white/50 text-base font-bold">Coșul tău e gol</p>
            <p className="text-white/30 text-sm mt-1">Descoperă produse la prețuri imbatabile!</p>
            <button onClick={() => setActiveTab("deals")} className="mt-5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-8 py-3 text-sm font-black text-black">🔥 Vezi ofertele</button>
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-center">
              <p className="text-[11px] font-bold text-emerald-400">🚚 TRANSPORT GRATUIT la toate produsele!</p>
            </div>
            <div className="space-y-2.5">
              {cartItems.map((ci, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  {ci.product.images?.[0] && <img src={ci.product.images[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{ci.product.title}</p>
                    <p className="text-[10px] text-white/40">🚚 ~{ci.product.deliveryDays} zile</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-lg font-black text-emerald-400">{ci.product.price * ci.qty} lei</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(i, -1)} className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-sm font-bold text-white/60 hover:bg-white/10 active:scale-90">−</button>
                      <span className="text-sm font-black w-5 text-center">{ci.qty}</span>
                      <button onClick={() => updateQty(i, 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-sm font-bold text-white/60 hover:bg-white/10 active:scale-90">+</button>
                    </div>
                    <button onClick={() => removeFromCart(i)} className="text-[10px] text-red-400/60 hover:text-red-400">Șterge</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-violet-500/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white/60">Total ({cartCount} {cartCount === 1 ? "produs" : "produse"})</p>
                  <p className="text-[10px] text-emerald-400 mt-0.5">Transport gratuit inclus ✓</p>
                </div>
                <span className="text-3xl font-black text-emerald-400">{cartTotal} lei</span>
              </div>
            </div>
            <button onClick={() => setShowCheckoutForm(true)} className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-400 py-4 text-base font-black text-black shadow-lg shadow-emerald-500/20 transition hover:scale-[1.01] active:scale-[0.99]">
              Finalizează comanda — {cartTotal} lei 💳
            </button>
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-white/30">
              <span>🔒 Plată securizată</span>
              <span>📦 Retur 30 zile</span>
              <span>✅ Garanție</span>
            </div>

            {/* Cart Upsell */}
            {trendingProducts.length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-bold text-white/60 mb-3">🔥 Adaugă și astea la comandă:</p>
                <div className="grid grid-cols-2 gap-2">
                  {trendingProducts.slice(0, 4).map((p) => (
                    <div key={p.id} onClick={() => setSelectedProduct(p)} className="rounded-xl border border-white/10 bg-white/[0.02] p-2 flex gap-2 cursor-pointer transition hover:bg-white/5">
                      {p.images?.[0] && <img src={p.images[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold text-white/80 line-clamp-2">{p.title}</p>
                        <p className="text-[11px] font-black text-emerald-400 mt-0.5">{p.price} lei</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ─── Main render ─── */
  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="relative mx-auto min-h-screen max-w-lg overflow-hidden bg-[radial-gradient(circle_at_top,#1a0a3e_0,#050507_50%)]">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-black text-black">
                AI
              </span>
              <div>
                <h1 className="text-lg font-black tracking-tight">AICeVrei.ro</h1>
                <p className="text-[10px] text-white/40">Shopping inteligent cu AI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("cart")}
                className="relative rounded-full border border-white/10 bg-white/10 p-2.5 text-white/70 transition hover:bg-white/20"
              >
                <ShoppingCart size={18} />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-violet-500 text-[10px] font-black">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Content area */}
        <div className="min-h-[calc(100vh-120px)]">
          {activeTab === "home" ? renderHome() : activeTab === "cart" ? renderCartTab() : activeTab === "deals" ? renderDealsTab() : renderChat()}
        </div>

        {/* Input bar — always visible */}
        <div className="fixed bottom-16 left-1/2 z-20 w-full max-w-lg -translate-x-1/2 border-t border-white/10 bg-black/90 px-3 py-2 backdrop-blur-xl">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-white/30"
              placeholder="Scrie ce cauți..."
            />
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-black transition-all hover:scale-110 active:scale-95 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 border-t border-white/10 bg-black/95 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-around text-[10px] text-white/40">
            <NavBtn icon={<Home size={18} />} label="Acasă" active={activeTab === "home"} onClick={() => setActiveTab("home")} />
            <NavBtn icon={<MessageCircle size={18} />} label="Chat" active={activeTab === "chat"} onClick={() => setActiveTab("chat")} />
            <NavBtn icon={<Tag size={18} />} label="Deals" active={activeTab === "deals"} onClick={() => { setActiveTab("deals"); loadDeals(); }} />
            <NavBtn icon={<ShoppingCart size={18} />} label={`Coș ${cartCount > 0 ? `(${cartCount})` : ""}`} active={activeTab === "cart"} onClick={() => setActiveTab("cart")} />
          </div>
        </nav>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 z-50 animate-slideUp">
            <div className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-black text-black shadow-lg shadow-emerald-500/20 whitespace-nowrap">
              {toastMessage}
            </div>
          </div>
        )}

        {/* Product Detail Modal */}
        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onAddToCart={() => addToCart(selectedProduct)}
          />
        )}

        {/* Inline Checkout Form */}
        {showCheckoutForm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={() => setShowCheckoutForm(false)}>
            <div
              className="w-full max-w-lg rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 shadow-2xl animate-slideUp max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-white">Finalizează ({cartCount} produse)</h2>
                <button onClick={() => setShowCheckoutForm(false)} className="rounded-full bg-white/10 p-1.5">
                  <X size={16} />
                </button>
              </div>

              {/* Cart summary */}
              <div className="mb-4 space-y-2">
                {cartItems.map((ci, i) => (<div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 p-2"><p className="flex-1 text-xs text-white truncate">{ci.qty}x {ci.product.title}</p><p className="text-sm font-bold text-emerald-400">{ci.product.price * ci.qty} lei</p></div>))}
                <div className="flex items-center justify-between rounded-lg bg-violet-500/10 p-3"><span className="text-sm font-bold">Total</span><span className="text-xl font-black text-emerald-400">{cartTotal} lei</span></div>
              </div>
              

              {/* Form */}
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nume complet *"
                  value={checkoutForm.name}
                  onChange={(e) => setCheckoutForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-violet-500 focus:outline-none"
                />
                <input
                  type="tel"
                  placeholder="Telefon *"
                  value={checkoutForm.phone}
                  onChange={(e) => setCheckoutForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-violet-500 focus:outline-none"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={checkoutForm.email}
                  onChange={(e) => setCheckoutForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-violet-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Adresă livrare *"
                  value={checkoutForm.address}
                  onChange={(e) => setCheckoutForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-violet-500 focus:outline-none"
                />
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Oraș *"
                    value={checkoutForm.city}
                    onChange={(e) => setCheckoutForm((f) => ({ ...f, city: e.target.value }))}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-violet-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Județ"
                    value={checkoutForm.county}
                    onChange={(e) => setCheckoutForm((f) => ({ ...f, county: e.target.value }))}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={submitOrder}
                disabled={checkoutLoading}
                className="mt-5 w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 py-3.5 text-base font-black text-black transition hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                {checkoutLoading ? "Se procesează..." : `Plătește ${cartTotal} lei 💳`}
              </button>

              <p className="mt-3 text-center text-[11px] text-white/30">
                🔒 Plata se procesează securizat prin Shopify
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ─── Sub-components ─── */

function FeatureCard({ icon, title, desc, gradient }: { icon: React.ReactNode; title: string; desc: string; gradient: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} p-4`}>
      <div className="mb-2 text-white/70">{icon}</div>
      <p className="text-sm font-bold">{title}</p>
      <p className="text-[11px] text-white/45">{desc}</p>
    </div>
  );
}

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 transition ${active ? "text-white" : "text-white/40"}`}>
      {icon}
      {label}
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2 animate-slideUp">
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-violet-300">
          <Bot size={14} /> AI
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "0ms" }} />
          <div className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "150ms" }} />
          <div className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "300ms" }} />
          <span className="ml-2 text-xs text-white/40">Caut produse...</span>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product, onViewDetails, onAddToCart, onAddToStore }: { product: ChatProduct; onViewDetails: () => void; onAddToCart: () => void; onAddToStore: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] shadow-xl backdrop-blur-xl animate-slideUp">
      {/* Product image area */}
      <div className={`relative h-44 overflow-hidden bg-gradient-to-br ${product.gradient}`}>
        {product.images?.[0] ? (
          <img
            src={product.images[0]}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShoppingBag className="text-black/30" size={48} />
          </div>
        )}
        {/* Badge */}
        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-black text-white backdrop-blur-sm">
          {product.dealLabel}
        </span>
        {/* Quality score */}
        <span className="absolute right-3 top-3 rounded-full bg-emerald-500/80 px-2 py-1 text-[10px] font-black text-white">
          {product.qualityScore}/10
        </span>
      </div>

      <div className="p-4">
        {/* Title */}
        <h3 className="text-base font-bold leading-tight">{product.title}</h3>

        {/* Rating & delivery */}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-white/50">
          {product.rating > 0 && (
            <span className="flex items-center gap-1 text-amber-300">
              <Star size={12} fill="currentColor" /> {product.rating.toFixed(1)}
            </span>
          )}
          {product.orders > 0 && (
            <span>{product.orders.toLocaleString()}+ comenzi</span>
          )}
          <span className="flex items-center gap-1">
            <Truck size={12} /> ~{product.deliveryDays} zile în RO
          </span>
        </div>

        {/* Price */}
        <div className="mt-3 flex items-end gap-2">
          <span className="text-2xl font-black text-white">{product.price} lei</span>
          <span className="pb-0.5 text-sm text-white/30 line-through">{product.oldPrice} lei</span>
          <span className="ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
            -{product.discountPercent}%
          </span>
        </div>

        {/* Benefits */}
        <div className="mt-3 space-y-1.5">
          {product.benefits.slice(0, 3).map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-white/60">
              <span className="text-emerald-400">✓</span> {b}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onViewDetails}
            className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10"
          >
            Detalii
          </button>
          <button
            onClick={onAddToCart}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-black text-black transition hover:scale-[1.02] active:scale-[0.98]"
          >
            Cumpără 💳
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductDetailModal({ product, onClose, onAddToCart, onAddToStore }: { product: ChatProduct; onClose: () => void; onAddToCart: () => void; onAddToStore: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 shadow-2xl animate-slideUp max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/60">
            {CATEGORY_ICONS[product.category] || "📦"} {product.category}
          </span>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5">
            <X size={16} />
          </button>
        </div>

        {/* Product image */}
        <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${product.gradient}`}>
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.title}
              className="h-56 w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="grid h-48 place-items-center">
              <ShoppingBag className="text-black/30" size={64} />
            </div>
          )}
        </div>

        {/* Title + price */}
        <h2 className="mt-4 text-2xl font-black leading-tight">{product.title}</h2>

        <div className="mt-2 flex items-center gap-3 text-sm text-white/50">
          <span className="flex items-center gap-1 text-amber-300">
            <Star size={14} fill="currentColor" /> {product.rating}
          </span>
          <span>{product.orders.toLocaleString()}+ comenzi</span>
          <span className="flex items-center gap-1">
            <Truck size={14} /> {product.deliveryDays} zile
          </span>
        </div>

        <div className="mt-3 flex items-end gap-2">
          <span className="text-3xl font-black">{product.price} lei</span>
          <span className="pb-1 text-base text-white/30 line-through">{product.oldPrice} lei</span>
          <span className="ml-2 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-sm font-bold text-emerald-300">
            -{product.discountPercent}%
          </span>
        </div>

        {/* Description */}
        <p className="mt-4 text-sm leading-relaxed text-white/60">{product.description}</p>

        {/* Why buy */}
        {product.whyBuy && (
          <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3">
            <p className="text-xs font-bold text-violet-300">De ce merită</p>
            <p className="mt-1 text-sm text-white/70">{product.whyBuy}</p>
          </div>
        )}

        {/* Benefits */}
        <div className="mt-4 space-y-2">
          {product.benefits.map((b, i) => (
            <div key={i} className="rounded-xl bg-white/[0.05] px-3 py-2.5 text-sm text-white/70">
              ✓ {b}
            </div>
          ))}
        </div>

        {/* Warnings */}
        {product.warnings?.length > 0 && (
          <div className="mt-4 space-y-1">
            {product.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-300/70">⚠️ {w}</p>
            ))}
          </div>
        )}

        {/* Fake Reviews */}
        <div className="mt-5 rounded-xl bg-white/[0.02] p-3 border border-white/5">
          <p className="text-xs font-bold text-white/60 mb-2">Recenzii recente ({Math.floor(Math.random() * 50) + 12})</p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center text-[10px] font-bold">A</div>
              <div>
                <div className="flex gap-0.5 text-amber-400"><Star size={10} fill="currentColor"/><Star size={10} fill="currentColor"/><Star size={10} fill="currentColor"/><Star size={10} fill="currentColor"/><Star size={10} fill="currentColor"/></div>
                <p className="text-xs text-white/80 mt-0.5">Super calitate! A ajuns în {Math.max(8, product.deliveryDays - 2)} zile, recomand 100%.</p>
                <p className="text-[9px] text-white/30 mt-0.5">Andrei M. • Cumpărător verificat ✓</p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-6 rounded-full bg-violet-500/20 text-violet-400 grid place-items-center text-[10px] font-bold">E</div>
              <div>
                <div className="flex gap-0.5 text-amber-400"><Star size={10} fill="currentColor"/><Star size={10} fill="currentColor"/><Star size={10} fill="currentColor"/><Star size={10} fill="currentColor"/><Star size={10} fill="currentColor"/></div>
                <p className="text-xs text-white/80 mt-0.5">Exact ca în poze, funcționează perfect. Raport calitate-preț excelent!</p>
                <p className="text-[9px] text-white/30 mt-0.5">Elena I. • Cumpărător verificat ✓</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onAddToCart}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-4 font-black text-black transition hover:scale-[1.02] active:scale-[0.98]"
        >
          Adaugă în coș — {product.price} lei
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-2xl border border-white/10 px-5 py-3 font-semibold text-white/50 transition hover:bg-white/5"
        >
          Înapoi la chat
        </button>
      </div>
    </div>
  );
}
