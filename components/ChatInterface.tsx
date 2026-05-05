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

/* ─── Quick action categories ─── */
const QUICK_ACTIONS = [
  { label: "🎧 Căști", query: "vreau căști wireless bluetooth" },
  { label: "📱 Telefon", query: "accesorii telefon husa incarcator" },
  { label: "💄 Beauty", query: "produse beauty skincare" },
  { label: "🏋️ Fitness", query: "echipament fitness sport" },
  { label: "🚗 Auto", query: "accesorii auto mașină" },
  { label: "🏠 Casă", query: "gadget pentru casă bucătărie" },
  { label: "💡 LED", query: "lumini LED bandă RGB" },
  { label: "⌚ Ceasuri", query: "ceas smart watch inteligent" },
  { label: "🎮 Gaming", query: "accesorii gaming mouse tastatura" },
  { label: "🎁 Cadouri", query: "cadou gadget unic" },
  { label: "👕 Fashion", query: "accesorii fashion bijuterii" },
  { label: "📷 Foto", query: "cameră foto accesorii" },
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
  const [cartCount, setCartCount] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [activeTab, setActiveTab] = useState<"home" | "chat" | "deals" | "cart">("home");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /* ─── Send message ─── */
  async function sendMessage(text?: string) {
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

  const [checkoutProduct, setCheckoutProduct] = useState<ChatProduct | null>(null);
  const [checkoutForm, setCheckoutForm] = useState({ name: "", email: "", phone: "", address: "", city: "", county: "" });
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  function startCheckout(product: ChatProduct) {
    setCheckoutProduct(product);
    setSelectedProduct(null);
  }

  async function submitOrder() {
    if (!checkoutProduct) return;
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
          product: checkoutProduct,
          quantity: 1,
          customer: checkoutForm,
        }),
      });
      const data = await res.json();

      setCheckoutProduct(null);
      setCheckoutForm({ name: "", email: "", phone: "", address: "", city: "", county: "" });
      setCartCount((c) => c + 1);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.checkoutUrl
            ? `✅ Comanda pentru **${checkoutProduct.title}** (${checkoutProduct.price} lei) a fost creată!\n\n📧 ${checkoutForm.name}, finalizează plata aici:\n👉 [Plătește acum](${data.checkoutUrl})`
            : `✅ Comanda pentru **${checkoutProduct.title}** a fost înregistrată! Te vom contacta pe ${checkoutForm.phone} cu detalii de plată.`,
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
                onClick={() => sendMessage(action.query)}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white/80 transition-all hover:bg-white/10 hover:scale-105 active:scale-95"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feature cards */}
        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <FeatureCard
            icon={<Bot size={20} />}
            title="AI Asistent"
            desc="Recomandări personalizate"
            gradient="from-violet-500/20 to-violet-500/5"
          />
          <FeatureCard
            icon={<Tag size={20} />}
            title="Prețuri Bune"
            desc="Filtrate automat"
            gradient="from-cyan-500/20 to-cyan-500/5"
          />
          <FeatureCard
            icon={<Truck size={20} />}
            title="Livrare Rapidă"
            desc="8-25 zile în România"
            gradient="from-emerald-500/20 to-emerald-500/5"
          />
          <FeatureCard
            icon={<Star size={20} />}
            title="Rating 4.5+"
            desc="Doar produse verificate"
            gradient="from-amber-500/20 to-amber-500/5"
          />
        </div>
      </div>
    );
  }

  /* ─── Render chat messages ─── */
  function renderChat() {
    if (messages.length === 0) return renderHome();

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
                      onAddToCart={() => startCheckout(product)}
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
          {renderChat()}
        </div>

        {/* Input bar — always visible */}
        <div className="fixed bottom-14 left-1/2 z-20 w-full max-w-lg -translate-x-1/2 border-t border-white/10 bg-black/80 px-3 py-2 backdrop-blur-xl">
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
        <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 border-t border-white/10 bg-black/80 px-4 py-2 backdrop-blur-xl">
          <div className="flex items-center justify-around text-[10px] text-white/40">
            <NavBtn icon={<Home size={18} />} label="Acasă" active={activeTab === "home" && messages.length === 0} onClick={() => { setActiveTab("home"); if (messages.length === 0) scrollToBottom(); }} />
            <NavBtn icon={<MessageCircle size={18} />} label="Chat" active={activeTab === "chat" || messages.length > 0} onClick={() => setActiveTab("chat")} />
            <NavBtn icon={<Tag size={18} />} label="Deals" active={activeTab === "deals"} onClick={() => setActiveTab("deals")} />
            <NavBtn icon={<ShoppingCart size={18} />} label={`Coș ${cartCount > 0 ? `(${cartCount})` : ""}`} active={activeTab === "cart"} onClick={() => setActiveTab("cart")} />
          </div>
        </nav>

        {/* Product Detail Modal */}
        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onAddToCart={() => startCheckout(selectedProduct)}
          />
        )}

        {/* Inline Checkout Form */}
        {checkoutProduct && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={() => setCheckoutProduct(null)}>
            <div
              className="w-full max-w-lg rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 shadow-2xl animate-slideUp max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black text-white">Finalizează comanda</h2>
                <button onClick={() => setCheckoutProduct(null)} className="rounded-full bg-white/10 p-1.5">
                  <X size={16} />
                </button>
              </div>

              {/* Product summary */}
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-white/5 p-3">
                {checkoutProduct.images?.[0] && (
                  <img src={checkoutProduct.images[0]} alt="" className="h-14 w-14 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{checkoutProduct.title}</p>
                  <p className="text-lg font-black text-emerald-400">{checkoutProduct.price} lei</p>
                </div>
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
                {checkoutLoading ? "Se procesează..." : `Plătește ${checkoutProduct.price} lei 💳`}
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

function ProductCard({ product, onViewDetails, onAddToCart }: { product: ChatProduct; onViewDetails: () => void; onAddToCart: () => void }) {
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

function ProductDetailModal({ product, onClose, onAddToCart }: { product: ChatProduct; onClose: () => void; onAddToCart: () => void }) {
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
