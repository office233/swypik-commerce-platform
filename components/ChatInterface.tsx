"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown, ChevronRight, Flame, Grid3x3, Home, MessageCircle, Package, Search, Send, ShoppingCart, SlidersHorizontal, Star, Tag, Truck, X, Zap } from "lucide-react";
import ProductFeed from "./ProductFeed";
import { THEME, commerceBadgeClass, translateCategory } from "@/lib/ui/theme";

type ChatProduct = {
  id: string; pgId?: number; title: string; description: string; benefits: string[]; dealLabel: string; whyBuy: string; warnings: string[];
  price: number; oldPrice: number; discountPercent: number; rating: number; orders: number; deliveryDays: number;
  images: string[]; category: string; gradient: string; qualityScore: number;
  viewers?: number; cartAdds?: number; likes?: number; commentCount?: number; socialProofLabel?: string; variantId?: string; commerceBadge?: string;
  variantsCount?: number;
};

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; products?: ChatProduct[]; bundleProducts?: ChatProduct[]; timestamp: Date };
type CartItem = { product: ChatProduct; qty: number };
type Tab = "home" | "chat" | "deals" | "feed" | "cart" | "categories";
type Suggestion = { label: string; type: "product" | "category" | "tag"; score: number };
type FunnelStage = "discover" | "compare" | "consider" | "cart" | "checkout" | "upsell";

const QUICK_PROMPTS = [
  { label: "🎮 Setup gaming", query: "setup gaming complet sub 4000 lei" },
  { label: "👗 Outfit nuntă", query: "outfit complet elegant pentru nuntă" },
  { label: "🏠 Apartament nou", query: "kit apartament nou sub 2000 lei" },
  { label: "🎁 Cadou sub 200", query: "cadou creativ sub 200 lei" },
  { label: "💻 Setup birou", query: "setup birou de acasă complet" },
  { label: "💄 Rutină skincare", query: "rutină skincare completă" },
  { label: "🏋️ Kit fitness", query: "kit fitness acasă complet" },
  { label: "📱 Kit iPhone", query: "kit complet accesorii iPhone" },
  { label: "🐾 Kit animal nou", query: "kit complet animal de companie nou" },
];

const AI_WELCOME: ChatMessage = {
  id: "welcome", role: "assistant", timestamp: new Date(),
  content: `Bună! 👋 Sunt asistentul tău de shopping.

Spune-mi ce cauți și eu:
• Găsesc cele mai bune opțiuni
• Explic de ce merită fiecare
• Fac bundle-uri complete cu tot ce ai nevoie
• Compar prețuri și calitate

Încearcă ceva de genul:
💻 "Setup gaming sub 4000 lei"
👗 "Outfit elegant pentru nuntă"
🏠 "Apartament nou sub 2000 lei"`,
};

export default function ChatInterface() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [sessionId, setSessionId] = useState("");
  const [trendingProducts, setTrendingProducts] = useState<ChatProduct[]>([]);
  const [bestValueProducts, setBestValueProducts] = useState<ChatProduct[]>([]);
  const [topRatedProducts, setTopRatedProducts] = useState<ChatProduct[]>([]);
  const [dealsProducts, setDealsProducts] = useState<ChatProduct[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [feedProducts, setFeedProducts] = useState<ChatProduct[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ChatProduct | null>(null);
  const [lastShownProducts, setLastShownProducts] = useState<ChatProduct[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [toastMessage, setToastMessage] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchResults, setSearchResults] = useState<ChatProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("discover");
  const [upsellProduct, setUpsellProduct] = useState<ChatProduct | null>(null);
  const [showBundleSheet, setShowBundleSheet] = useState(false);
  const [categoryTree, setCategoryTree] = useState<any[]>([]);
  const [expandedCat, setExpandedCat] = useState<string|null>(null);
  const [expandedMid, setExpandedMid] = useState<string|null>(null);
  const [activeSub, setActiveSub] = useState<string|null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterSort, setFilterSort] = useState("popular");
  const [filterMaxPrice, setFilterMaxPrice] = useState(500);
  const [catProducts, setCatProducts] = useState<ChatProduct[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catTitle, setCatTitle] = useState("");
  const [catPage, setCatPage] = useState(1);
  const [catTotal, setCatTotal] = useState(0);
  const [catBrowsing, setCatBrowsing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSessionId(Math.random().toString(36).slice(2) + Date.now().toString(36)); fetch("/api/products?mode=trending&limit=30").then((r) => r.json()).then((d) => setTrendingProducts(d.products || [])).catch(() => {}); fetch("/api/products?mode=bestvalue&limit=30").then((r) => r.json()).then((d) => setBestValueProducts(d.products || [])).catch(() => {}); fetch("/api/products?mode=toprated&limit=30").then((r) => r.json()).then((d) => setTopRatedProducts(d.products || [])).catch(() => {}); fetch("/api/products?hierarchy=true").then(r=>r.json()).then(d=>setCategoryTree(d.hierarchy||[])).catch(()=>{}); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);
  useEffect(() => { if (activeTab === "deals" && dealsProducts.length === 0 && !dealsLoading) loadDeals(); if (activeTab === "feed" && feedProducts.length === 0 && !feedLoading) loadFeed(); }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "home" || input.trim().length < 2) { setSuggestions([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => { fetch(`/api/search/suggest?q=${encodeURIComponent(input.trim())}&limit=8`, { signal: ctrl.signal }).then((r) => r.json()).then((d) => setSuggestions(d.suggestions || [])).catch(() => {}); }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [input, activeTab]);

  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const funnelCta = funnelStage === "compare" ? "Vezi alternative" : funnelStage === "cart" || funnelStage === "upsell" ? "Completează bundle-ul" : "Caută";
  const bundleCandidates = lastShownProducts.filter((p) => !cartItems.some((item) => item.product.id === p.id)).slice(0, 4);
  const bundleTotal = [...cartItems.map((i) => i.product), ...bundleCandidates.slice(0, 2)].reduce((sum, p) => sum + p.price, 0);
  const bundleOldTotal = [...cartItems.map((i) => i.product), ...bundleCandidates.slice(0, 2)].reduce((sum, p) => sum + (p.oldPrice || p.price), 0);
  const bundleSavings = Math.max(0, Math.round(bundleOldTotal - bundleTotal));

  function addToCart(product: ChatProduct, quantity: number = 1) {
    setCartItems((prev) => { const idx = prev.findIndex((item) => item.product.id === product.id); if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + quantity }; return next; } return [...prev, { product, qty: quantity }]; });
    setSelectedProduct(null); setToastMessage(`🛒 ${quantity > 1 ? quantity + 'x ' : ''}${product.title.slice(0, 24)} adăugat în coș`); setFunnelStage("upsell");
    const candidate = lastShownProducts.find((p) => p.id !== product.id && !cartItems.some((item) => item.product.id === p.id));
    if (candidate) setUpsellProduct(candidate);
    setTimeout(() => setToastMessage(""), 2500);
  }

  function findProductForAI(data: any) { const all = [...lastShownProducts, ...(data.products || []), ...(data.bundleProducts || [])]; if (data.productId) return all.find((p) => p.id === data.productId); if (data.productTitle) { const needle = String(data.productTitle).toLowerCase(); return all.find((p) => p.title.toLowerCase().includes(needle)); } return all.length === 1 ? all[0] : null; }

  async function runRealSearch(query: string) {
    const q = query.trim(); if (!q) return;
    setSearchLoading(true); setSuggestions([]); setInput(q); setFunnelStage(q.includes("ieftin") || q.includes("sub") ? "compare" : "discover");
    try { const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=24`); const data = await res.json(); setSearchResults(data.products || []); if (data.products?.length) setLastShownProducts(data.products); } finally { setSearchLoading(false); }
  }
  async function browseCategory(catPath: string, fromCatTab = false, page = 1) {
    if (fromCatTab) {
      if (page === 1) setCatLoading(true);
      setCatTitle(catPath); setCatPage(page); setCatBrowsing(true);
    } else { setSearchLoading(true); }
    setActiveSub(catPath);
    const offset = (page - 1) * 20;
    try {
      const catName = catPath.includes(" > ") ? catPath.split(" > ").pop()!.trim() : catPath;
      const res = await fetch(`/api/products?category=${encodeURIComponent(catName)}&limit=20&offset=${offset}&sort=${filterSort}&maxPrice=${filterMaxPrice}`);
      const data = await res.json();
      if (fromCatTab) {
        if (page === 1) {
          setCatProducts(data.products || []);
        } else {
          setCatProducts(prev => [...prev, ...(data.products || [])]);
        }
        setCatTotal(data.total || data.products?.length || 0);
      } else {
        setSearchResults(data.products || []);
      }
      if (data.products?.length) setLastShownProducts(data.products);
    } finally {
      if (fromCatTab) setCatLoading(false); else setSearchLoading(false);
    }
  }

  async function sendMessage(text?: string) {
    const msg = (text || input).trim(); if (!msg || isLoading) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: msg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]); setInput(""); setIsLoading(true); setActiveTab("chat");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg, sessionId, productContext: lastShownProducts.slice(0, 12), chatHistory: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })) }) });
      const data = await res.json(); if (!res.ok) throw new Error(data?.error || "Nu am putut căuta în Shopify.");
      setFunnelStage(data.intent === "add_to_cart" ? "cart" : data.intent === "checkout" ? "checkout" : data.intent === "find_cheaper" ? "compare" : data.intent === "search_product" ? "discover" : funnelStage);
      if (data.intent === "add_to_cart") { const product = findProductForAI(data); if (product) addToCart(product); }
      const products = data.products || []; const bundleProducts = data.bundleProducts || [];
      if (products.length || bundleProducts.length) setLastShownProducts([...products, ...bundleProducts]);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.reply || "Am căutat în magazin.", products, bundleProducts, timestamp: new Date() }]);
      if (data.sessionId) setSessionId(data.sessionId);
    } catch (error: any) { setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: error?.message || "A apărut o eroare.", timestamp: new Date() }]); } finally { setIsLoading(false); }
  }

  async function loadDeals() { if (dealsLoading) return; setDealsLoading(true); try { const data = await fetch("/api/products?mode=deals&limit=50&sort=popular").then((r) => r.json()); setDealsProducts(data.products || []); } finally { setDealsLoading(false); } }
  async function loadFeed() { if (feedLoading) return; setFeedLoading(true); try { const data = await fetch("/api/products?mode=feed&limit=60").then((r) => r.json()); setFeedProducts(data.products || []); } finally { setFeedLoading(false); } }
  const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null);

  async function loadMoreFeed() { if (feedLoading) return; setFeedLoading(true); try { const offset = feedProducts.length; const data = await fetch(`/api/products?mode=feed&limit=30&offset=${offset}`).then((r) => r.json()); setFeedProducts((prev) => { const existing = new Set(prev.map((p) => p.id)); return [...prev, ...(data.products || []).filter((p: ChatProduct) => !existing.has(p.id))]; }); } finally { setFeedLoading(false); } }
  function updateQty(index: number, delta: number) { setCartItems((prev) => { const next = [...prev]; next[index] = { ...next[index], qty: Math.max(0, next[index].qty + delta) }; return next.filter((item) => item.qty > 0); }); }
  async function submitOrder() { if (cartItems.length === 0 || checkoutLoading) return; setCheckoutLoading(true); try { const res = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: cartItems.map((item) => ({ pgId: item.product.pgId, title: item.product.title, price: item.product.price, oldPrice: item.product.oldPrice, image: item.product.images?.[0], category: item.product.category, variantId: item.product.variantId, quantity: item.qty })) }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data?.error || "Nu am putut crea checkout-ul."); if (data.checkoutUrl) window.location.href = data.checkoutUrl; } catch (error: any) { setToastMessage(error?.message || "Eroare checkout."); setTimeout(() => setToastMessage(""), 4000); } finally { setCheckoutLoading(false); } }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const dx = touchStart.x - e.changedTouches[0].clientX;
    const dy = touchStart.y - e.changedTouches[0].clientY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const tabs = ["home", "categories", "feed", "chat", "cart"] as const;
      const idx = tabs.indexOf(activeTab as any);
      if (dx > 0 && idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
      if (dx < 0 && idx > 0) setActiveTab(tabs[idx - 1]);
    }
    setTouchStart(null);
  };

  const [cardQty, setCardQty] = useState<Record<string, number>>({});
  const getCardQty = (id: string) => cardQty[id] || 1;
  const updateCardQty = (id: string, delta: number) => setCardQty(prev => ({ ...prev, [id]: Math.max(1, (prev[id] || 1) + delta) }));

  const ProductCard = ({ product, compact = false }: { product: ChatProduct; compact?: boolean }) => {
    const badge = product.commerceBadge;
    const insight = product.rating >= 4.8 && product.orders >= 200 ? '⭐ Calitate peste medie' : product.orders >= 500 ? '✅ Seller verificat' : product.discountPercent >= 25 ? '💰 Reducere reală' : product.qualityScore >= 9 ? '🏆 Best value' : null;
    const q = getCardQty(product.id);
    const vc = product.variantsCount || 0;
    return (
      <div className={`${compact ? "w-[10.5rem] shrink-0" : ""} overflow-hidden rounded-2xl bg-white border border-[#E5E5E5] hover:border-[#D1D1D6] hover:shadow-md transition-all cursor-pointer`} onClick={() => router.push(`/product/${product.pgId || product.id}`)}>
        <div className="relative h-44 bg-[#F7F7F8]">
          {product.images?.[0] ? <img src={product.images[0]} alt={product.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Package className="text-[#D1D1D6]" /></div>}
          {product.discountPercent > 0 && <span className="absolute right-2 top-2 rounded-full bg-[#EF4444] px-2.5 py-1 text-[10px] font-black text-white">-{product.discountPercent}%</span>}
          {badge && <span className={`absolute left-2 top-2 max-w-[80%] rounded-full px-2.5 py-1 text-[10px] font-black shadow ${commerceBadgeClass(badge)}`}>{badge}</span>}
          {vc > 1 && <span className="absolute left-2 bottom-2 rounded-full bg-[#0D0D0D]/80 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">{vc} variante</span>}
        </div>
        <div className="p-3">
          <p className="line-clamp-2 text-[13px] font-bold leading-tight text-[#0D0D0D]">{product.title}</p>
          {insight && <p className="mt-1 text-[11px] font-semibold text-[#10A37F]">{insight}</p>}
          <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-[#6E6E80]">
            <span className="text-[#F59E0B]">★ {product.rating?.toFixed?.(1) || "4.8"}</span>
            <span>{product.orders || 0}+ comenzi</span>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-lg font-black text-[#10A37F]">{product.price} lei</span>
            {product.oldPrice > product.price && <span className="text-[11px] text-[#6E6E80] line-through">{product.oldPrice} lei</span>}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-[#E5E5E5] overflow-hidden" onClick={e => e.stopPropagation()}>
              <button onClick={(e) => { e.stopPropagation(); updateCardQty(product.id, -1); }} className="grid h-7 w-7 place-items-center text-[#6E6E80] hover:bg-[#F7F7F8] active:scale-90 transition-all text-xs font-bold">−</button>
              <span className="w-5 text-center text-xs font-black text-[#0D0D0D]">{q}</span>
              <button onClick={(e) => { e.stopPropagation(); updateCardQty(product.id, 1); }} className="grid h-7 w-7 place-items-center text-[#6E6E80] hover:bg-[#F7F7F8] active:scale-90 transition-all text-xs font-bold">+</button>
            </div>
            <button onClick={(e) => { e.stopPropagation(); addToCart(product, q); setCardQty(prev => ({ ...prev, [product.id]: 1 })); }} className={`flex-1 rounded-lg py-2 text-xs font-bold ${THEME.classes.cartButton}`}>
              <ShoppingCart size={13} className="mr-1 inline" />{q > 1 ? `${q}x Coș` : "Coș"}
            </button>
          </div>
        </div>
      </div>
    );
  };
  const ProductSkeleton = ({ compact = false }) => <div className={`${compact ? "w-[10.5rem] shrink-0" : ""} overflow-hidden rounded-2xl bg-white border border-[#E5E5E5] animate-pulse`}><div className="h-44 bg-[#F7F7F8]"></div><div className="p-3"><div className="h-4 bg-[#F7F7F8] rounded mb-2 w-3/4"></div><div className="h-4 bg-[#F7F7F8] rounded mb-4 w-1/2"></div><div className="h-6 bg-[#F7F7F8] rounded w-1/3"></div><div className="mt-2 h-8 w-full rounded-lg bg-[#F7F7F8]"></div></div></div>;
  const ProductCarousel = ({ title, products, isLoading }: { title: string; products?: ChatProduct[]; isLoading?: boolean }) => { if (isLoading) return <div className="mt-4 text-left"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#6E6E80]">{title}</p><div className="flex snap-x gap-3 overflow-x-auto pb-3 no-scrollbar"><div className="snap-start"><ProductSkeleton compact /></div><div className="snap-start"><ProductSkeleton compact /></div><div className="snap-start"><ProductSkeleton compact /></div></div></div>; if (!products?.length) return null; return <div className="mt-4 text-left" onTouchStart={(e)=>e.stopPropagation()} onTouchEnd={(e)=>e.stopPropagation()}><p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#6E6E80]">{title}</p><div className="flex snap-x gap-3 overflow-x-auto pb-3 no-scrollbar">{products.map((p) => <div key={p.id} className="snap-start"><ProductCard product={p} compact /></div>)}</div></div>; };

  return <main className={`min-h-screen ${THEME.classes.appBg}`}><div className={`relative mx-auto min-h-screen max-w-lg ${THEME.classes.pageBg}`}>{activeTab !== "feed" && <header className="sticky top-0 z-30 border-b border-[#E5E5E5] bg-white/95 px-4 py-3 backdrop-blur-xl"><div className="flex items-center justify-between"><button onClick={() => setActiveTab("home")} className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0D0D0D] text-sm font-black text-white">AI</span><div className="text-left"><h1 className="text-lg font-black text-[#0D0D0D]">AICeVrei.ro</h1><p className="text-[10px] font-semibold text-[#6E6E80]">{funnelStage === "compare" ? "compară și alege rapid" : funnelStage === "upsell" ? "completează bundle-ul" : "Asistentul tău de shopping"}</p></div></button><button onClick={() => setActiveTab("cart")} className="relative rounded-xl bg-[#0D0D0D] p-2.5 text-white"><ShoppingCart size={18} />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#10A37F] text-[10px] font-black text-white">{cartCount}</span>}</button></div></header>}
    <section className={activeTab === "feed" ? "h-screen" : "min-h-[calc(100vh-132px)] pb-36"} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {activeTab === "home" && (
        <div className="px-4 pt-6">
          <div className="rounded-2xl border border-[#E5E5E5] bg-[#F7F7F8] p-6">
            <h2 className="text-3xl font-black leading-tight tracking-tight text-[#0D0D0D]">Spune-mi ce vrei.<br/>Eu găsesc ce chiar merită.</h2>
            <p className="mt-2 text-sm font-medium text-[#6E6E80]">AI-ul tău de shopping personal. Nu mai pierde ore căutând.</p>
            <div className="relative">
              <div className={`mt-4 flex items-center gap-2 rounded-xl p-3 ${THEME.classes.softInput}`}>
                <Search size={20} className="text-[#6E6E80]" />
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runRealSearch(input); }} className="w-full bg-transparent text-sm font-medium text-[#0D0D0D] outline-none placeholder:text-[#A1A1AA]" placeholder="Ex: setup gaming sub 4000, cadou creativ..." />
              </div>
              {suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl bg-white shadow-lg border border-[#E5E5E5]">{suggestions.map((s) => <button key={`${s.type}-${s.label}`} onClick={() => runRealSearch(s.label)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#0D0D0D] hover:bg-[#F7F7F8]"><span>{s.label}</span><span className="rounded-full bg-[#F7F7F8] px-2 py-0.5 text-[10px] font-bold text-[#6E6E80]">{s.type}</span></button>)}</div>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => runRealSearch(input)} disabled={!input.trim() || searchLoading} className={`rounded-xl py-3.5 font-bold disabled:opacity-50 ${THEME.classes.primaryButton}`}>Caută</button>
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} className="rounded-xl bg-[#0D0D0D] py-3.5 font-bold text-white disabled:opacity-50">Întreabă AI</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((qa) => <button key={qa.label} onClick={() => sendMessage(qa.query)} className="rounded-full bg-white border border-[#E5E5E5] px-3.5 py-2 text-xs font-bold text-[#0D0D0D] hover:border-[#10A37F] hover:text-[#10A37F] active:scale-95 transition-all">{qa.label}</button>)}
          </div>
          <div className="mt-4">
            <button onClick={() => setActiveTab("categories")} className="w-full rounded-xl bg-[#0D0D0D] py-3 font-bold text-white flex items-center justify-center gap-2"><Grid3x3 size={16} /> Explorează categorii</button>
          </div>
          {searchLoading ? <ProductCarousel title={`Se caută rezultate...`} isLoading={true} /> : searchResults.length > 0 && <ProductCarousel title={`Rezultate (${searchResults.length})`} products={searchResults} />}
          <ProductCarousel title="🔥 Popular acum" products={trendingProducts.slice(0, 20)} />
          <ProductCarousel title="🏆 Best Value — AI Pick" products={bestValueProducts.slice(0, 20)} />
          <ProductCarousel title="⭐ Top Rated (4.7+)" products={topRatedProducts.slice(0, 20)} />
        </div>
      )}
      {activeTab === "categories" && <div className="px-4 pt-4">{catBrowsing ? <div><div className="flex items-center gap-3 mb-4"><button onClick={() => { setCatBrowsing(false); setCatProducts([]); setCatTitle(""); }} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F7F8] border border-[#E5E5E5]"><ChevronDown size={16} className="rotate-90" /></button><div className="flex-1"><p className="text-lg font-black text-[#0D0D0D]">{catTitle.split(" > ").map(p => translateCategory(p.trim())).join(" → ")}</p><p className="text-xs text-[#6E6E80]">{catTotal} produse</p></div><button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold border transition-all ${showFilters ? "bg-[#0D0D0D] text-white border-[#0D0D0D]" : "bg-white text-[#0D0D0D] border-[#E5E5E5]"}`}><SlidersHorizontal size={14} /></button></div>{showFilters && <div className="mb-4 rounded-xl bg-[#F7F7F8] p-4 border border-[#E5E5E5] animate-slideDown space-y-3"><div><label className="text-xs font-bold text-[#6E6E80] uppercase">Sortare</label><div className="mt-1 flex flex-wrap gap-1.5">{[{v:"popular",l:"Popular"},{v:"price_asc",l:"Preț ↑"},{v:"price_desc",l:"Preț ↓"},{v:"newest",l:"Noi"},{v:"discount",l:"Reduceri"}].map(s=><button key={s.v} onClick={()=>{setFilterSort(s.v); browseCategory(catTitle, true, 1);}} className={`sub-chip rounded-lg px-3 py-1.5 text-xs font-semibold ${filterSort===s.v?"active":""}`}>{s.l}</button>)}</div></div><div><label className="text-xs font-bold text-[#6E6E80] uppercase">Preț maxim: {filterMaxPrice} lei</label><input type="range" min={20} max={2000} step={10} value={filterMaxPrice} onChange={e=>{setFilterMaxPrice(Number(e.target.value));}} onMouseUp={()=>browseCategory(catTitle,true,1)} onTouchEnd={()=>browseCategory(catTitle,true,1)} className="mt-1 w-full accent-[#10A37F]" /></div></div>}<div className="grid grid-cols-2 gap-3">{catProducts.map(p => <ProductCard key={p.id} product={p} />)}{catLoading && <><ProductSkeleton /><ProductSkeleton /><ProductSkeleton /><ProductSkeleton /></>}</div>{!catLoading && catProducts.length < catTotal && <button onClick={() => browseCategory(catTitle, true, catPage + 1)} className="mt-5 w-full rounded-xl bg-[#0D0D0D] py-4 text-sm font-bold text-white shadow-lg">Mai afișează +20 produse (din {catTotal})</button>}</div> : <><div className="flex items-center justify-between mb-4"><h2 className="text-2xl font-black text-[#0D0D0D]">Categorii</h2></div><div className="space-y-2">{categoryTree.map((cat:any)=><div key={cat.name} className="rounded-xl border border-[#E5E5E5] overflow-hidden"><button onClick={()=>{setExpandedCat(expandedCat===cat.name?null:cat.name);}} className={`w-full flex items-center justify-between p-4 text-left font-bold transition-colors ${expandedCat===cat.name?"bg-[#0D0D0D] text-white":"bg-white text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}><span className="text-sm">{translateCategory(cat.name)}</span><div className="flex items-center gap-2"><span className="text-[10px] opacity-60">{cat.count.toLocaleString()}</span><ChevronDown size={16} className={`transition-transform ${expandedCat===cat.name?"rotate-180":""}`}/></div></button>{expandedCat===cat.name&&<div className="p-3 bg-[#FAFAFA] border-t border-[#E5E5E5] animate-slideDown"><div className="grid grid-cols-2 gap-2">{(cat.children || []).map((mid:any)=><button key={mid.name} onClick={()=>browseCategory(`${cat.name} > ${mid.name}`,true)} className="rounded-lg p-3 text-left border transition-all bg-white border-[#E5E5E5] hover:border-[#10A37F]"><span className="text-xs font-bold block">{translateCategory(mid.name)}</span><span className="text-[10px] opacity-70">{mid.count.toLocaleString()} produse</span></button>)}</div></div>}</div>)}</div></>}</div>}
      {activeTab === "chat" && <div className="px-4 pt-4"><div className="space-y-4">{(messages.length === 0 ? [AI_WELCOME] : messages).map((m) => <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}><div className={`inline-block max-w-[88%] rounded-2xl px-4 py-3 text-sm font-medium ${m.role === "user" ? "bg-[#0D0D0D] text-white" : "bg-[#F7F7F8] text-[#0D0D0D] border border-[#E5E5E5]"}`}>{m.role === "assistant" && <div className="mb-1 flex items-center gap-1 text-xs font-bold text-[#10A37F]"><Bot size={13} /> AI Shopping Assistant</div>}<p className="whitespace-pre-wrap">{m.content}</p></div>{m.role === "assistant" && <><ProductCarousel title="Recomandate pentru tine" products={m.products} /><ProductCarousel title="Completează bundle-ul" products={m.bundleProducts} /></>}</div>)}{isLoading && <div className="rounded-xl bg-[#F7F7F8] p-3 text-sm font-medium text-[#6E6E80] border border-[#E5E5E5]">🧠 AI analizează și caută cele mai bune opțiuni...</div>}<div ref={messagesEndRef} /></div></div>}
      {activeTab === "deals" && <div className="px-4 pt-4"><h2 className="mb-3 text-2xl font-black text-[#0D0D0D]">Reduceri</h2>{dealsLoading ? <p className="py-20 text-center font-medium text-[#6E6E80]">Se încarcă...</p> : <div className="grid grid-cols-2 gap-3">{dealsProducts.map((p) => <ProductCard key={p.id} product={p} />)}</div>}</div>}
      {activeTab === "feed" && <ProductFeed products={feedProducts} onAddToCart={(p: any, q?: number) => addToCart(p, q || 1)} onLoadMore={loadMoreFeed} onClose={() => setActiveTab("home")} isLoading={feedLoading} />}
      {activeTab === "cart" && (
        <div className="px-4 pt-4 pb-10">
          <h2 className="mb-4 text-2xl font-black text-[#0D0D0D]">Coșul tău</h2>
          {cartItems.length === 0 ? <p className="py-20 text-center font-medium text-[#6E6E80]">Coșul este gol.</p> : (
            <>
              <div className="space-y-3">
                {cartItems.map((item, i) => (
                  <div key={item.product.id} className="flex gap-3 rounded-2xl bg-[#F7F7F8] p-3 border border-[#E5E5E5]">
                    {item.product.images?.[0] && <img src={item.product.images[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />}
                    <div className="flex-1">
                      <p className="line-clamp-2 text-sm font-bold text-[#0D0D0D]">{item.product.title}</p>
                      <p className="text-xs font-bold text-[#10A37F]">{item.product.price * item.qty} lei</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(i, -1)} className="grid h-8 w-8 place-items-center rounded-full bg-[#E5E5E5] font-bold text-[#0D0D0D] hover:bg-[#D1D1D6] active:scale-90 transition-transform">-</button>
                      <span className="w-4 text-center font-bold">{item.qty}</span>
                      <button onClick={() => updateQty(i, 1)} className="grid h-8 w-8 place-items-center rounded-full bg-[#E5E5E5] font-bold text-[#0D0D0D] hover:bg-[#D1D1D6] active:scale-90 transition-transform">+</button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-8 border-t border-[#E5E5E5] pt-6">
                <ProductCarousel title="🔥 Adaugă la ofertă și:" products={trendingProducts.slice(0, 5)} />
              </div>

              <div className="mt-5 rounded-2xl bg-[#F7F7F8] p-4 border border-[#E5E5E5]">
                <div className="flex justify-between text-xl font-black">
                  <span>Total</span>
                  <span className="text-[#10A37F]">{cartTotal} lei</span>
                </div>
                <button onClick={submitOrder} disabled={checkoutLoading} className={`mt-4 w-full rounded-xl py-4 font-bold disabled:opacity-50 ${THEME.classes.cartButton} active:scale-[0.98] transition-transform`}>
                  {checkoutLoading ? "Se procesează..." : `Finalizează comanda — ${cartTotal} lei`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
    {activeTab === "chat" && <div className="fixed bottom-14 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 border-t border-[#E5E5E5] bg-white/95 px-3 py-2 backdrop-blur-xl" onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}><div className={`flex gap-2 rounded-xl p-2 ${THEME.classes.softInput}`}><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} className="flex-1 bg-transparent px-2 text-sm font-medium text-[#0D0D0D] outline-none placeholder:text-[#A1A1AA]" placeholder="Scrie ce cauți..." /><button onClick={() => sendMessage()} disabled={!input.trim() || isLoading} className="grid h-10 w-10 place-items-center rounded-xl bg-[#0D0D0D] text-white disabled:opacity-40"><Send size={16} /></button></div></div>}{activeTab !== "feed" && <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 border-t border-[#E5E5E5] bg-white/95 px-4 py-2 backdrop-blur-xl"><div className="flex justify-around text-[10px] font-bold text-[#6E6E80]"><NavBtn icon={<Home size={18} />} label="Acasă" active={activeTab === "home"} onClick={() => setActiveTab("home")} /><NavBtn icon={<Grid3x3 size={18} />} label="Categorii" active={activeTab === "categories"} onClick={() => { setActiveTab("categories"); setCatBrowsing(false); }} /><NavBtn icon={<Flame size={18} />} label="Feed" active={activeTab === "feed"} onClick={() => setActiveTab("feed")} /><NavBtn icon={<MessageCircle size={18} />} label="Chat" active={activeTab === "chat"} onClick={() => setActiveTab("chat")} /><NavBtn icon={<ShoppingCart size={18} />} label={`Coș ${cartCount ? `(${cartCount})` : ""}`} active={activeTab === "cart"} onClick={() => setActiveTab("cart")} /></div></nav>}
    {upsellProduct && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setUpsellProduct(null)}><div className="w-full max-w-lg rounded-t-[2rem] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#10A37F]">Completează bundle-ul</p><h3 className="text-2xl font-black text-[#0D0D0D]">Mai vrei și asta?</h3><p className="mt-1 text-sm font-medium text-[#6E6E80]">Merge bine cu ce ai pus în coș.</p></div><button onClick={() => setUpsellProduct(null)}><X size={18} /></button></div><div className="mt-4 flex gap-3 rounded-2xl bg-[#F7F7F8] p-3 border border-[#E5E5E5]"><img src={upsellProduct.images?.[0]} alt="" className="h-24 w-24 rounded-xl object-cover" /><div className="flex-1"><p className="line-clamp-2 text-sm font-bold">{upsellProduct.title}</p><p className="mt-1 text-xl font-black text-[#10A37F]">{upsellProduct.price} lei</p><button onClick={() => { addToCart(upsellProduct); setUpsellProduct(null); }} className={`mt-2 w-full rounded-xl py-2 font-bold ${THEME.classes.cartButton}`}>Adaugă la bundle</button></div></div><button onClick={() => setUpsellProduct(null)} className="mt-3 w-full rounded-xl bg-[#F7F7F8] py-3 font-bold text-[#6E6E80]">Nu acum</button></div></div>}
    {showBundleSheet && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setShowBundleSheet(false)}><div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#10A37F]">AI Bundle</p><h3 className="text-2xl font-black">Bundle complet</h3><p className="text-sm font-medium text-[#6E6E80]">Total: {Math.round(bundleTotal)} lei {bundleSavings > 0 ? `• economisești ${bundleSavings} lei` : ""}</p></div><button onClick={() => setShowBundleSheet(false)}><X size={18} /></button></div><div className="mt-4 space-y-3">{bundleCandidates.map((p) => <div key={p.id} className="flex gap-3 rounded-2xl bg-[#F7F7F8] p-3 border border-[#E5E5E5]"><img src={p.images?.[0]} alt="" className="h-16 w-16 rounded-xl object-cover" /><div className="flex-1"><p className="line-clamp-2 text-sm font-bold">{p.title}</p><p className="text-sm font-bold text-[#10A37F]">{p.price} lei</p></div><button onClick={() => addToCart(p)} className="rounded-xl bg-[#10A37F] px-3 text-xs font-bold text-white">+ Coș</button></div>)}</div></div></div>}
    {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={() => addToCart(selectedProduct)} />}{toastMessage && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0D0D0D] px-4 py-2 text-sm font-bold text-white shadow-xl">{toastMessage}</div>}</div></main>;
}

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button onClick={onClick} onTouchEnd={(e)=>{e.stopPropagation();e.preventDefault();onClick();}} className={`flex flex-col items-center gap-0.5 transition-colors ${active ? "text-[#0D0D0D]" : "text-[#A1A1AA]"}`} style={{touchAction:'manipulation'}}>{icon}{label}</button>; }
function ProductModal({ product, onClose, onAddToCart }: { product: ChatProduct; onClose: () => void; onAddToCart: () => void }) { const insights: string[] = []; if (product.rating >= 4.7) insights.push(`⭐ Rating ${product.rating}/5 — calitate peste medie`); if (product.orders >= 500) insights.push(`✅ ${product.orders.toLocaleString()}+ comenzi — seller de încredere`); else if (product.orders >= 100) insights.push(`📦 ${product.orders}+ vândute — produs verificat`); if (product.discountPercent >= 20) insights.push(`💰 Reducere reală de ${product.discountPercent}% față de prețul standard`); if (product.qualityScore >= 9) insights.push('🏆 Best value în categoria sa'); if (product.deliveryDays <= 5) insights.push(`🚀 Livrare rapidă — ${product.deliveryDays} zile`); return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}><div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex justify-between"><span className="rounded-full bg-[#F7F7F8] px-3 py-1 text-xs font-bold text-[#6E6E80]">{product.category}</span><button onClick={onClose}><X size={18} /></button></div>{product.images?.[0] && <img src={product.images[0]} alt={product.title} className="h-64 w-full rounded-2xl object-cover" />}<h2 className="mt-4 text-2xl font-black text-[#0D0D0D]">{product.title}</h2><div className="mt-2 flex gap-3 text-sm font-medium text-[#6E6E80]"><span className="text-[#F59E0B]"><Star size={14} className="inline" fill="currentColor" /> {product.rating}</span><span>{product.orders}+ comenzi</span><span><Truck size={14} className="inline" /> {product.deliveryDays} zile</span></div><div className="mt-3"><span className="text-3xl font-black text-[#10A37F]">{product.price} lei</span>{product.oldPrice > product.price && <span className="ml-2 text-[#6E6E80] line-through">{product.oldPrice} lei</span>}</div>{insights.length > 0 && <div className="mt-4 rounded-2xl bg-gradient-to-br from-[#F0FDF4] to-[#ECFDF5] border border-[#BBF7D0] p-4"><p className="text-xs font-black uppercase tracking-widest text-[#10A37F] mb-2">🧠 De ce merită — AI Analysis</p><div className="space-y-1.5">{insights.map((ins, i) => <p key={i} className="text-sm font-medium text-[#0D0D0D]">{ins}</p>)}</div></div>}<p className="mt-4 text-sm font-medium leading-relaxed text-[#6E6E80]">{product.description}</p><button onClick={onAddToCart} className={`mt-4 w-full rounded-xl py-4 font-bold ${THEME.classes.cartButton}`}>Adaugă în coș — {product.price} lei</button><a href={`/product/${product.pgId || product.id}`} className="mt-2 block w-full rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] py-3 text-center text-sm font-bold text-[#0D0D0D] hover:bg-[#ECECF1] transition-colors">Vezi toate detaliile →</a></div></div>; }
