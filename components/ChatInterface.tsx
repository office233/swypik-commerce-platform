"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Bookmark, ChevronDown, ChevronRight, ClipboardList, Compass, Flame, Grid3x3, Home, LogOut, Menu, MessageCircle, Package, Search, Send, Shield, ShoppingCart, SlidersHorizontal, Sparkles, Star, Tag, Trophy, Truck, Upload, User, X, Zap } from "lucide-react";
import ProductFeed from "./ProductFeed";
import { THEME, commerceBadgeClass, translateCategory } from "@/lib/ui/theme";

import Image from "next/image";

import type { Product } from "@/types/product";
import type { CartItem } from "@/types/cart";
import { mergeIntoCart, buildCheckoutPayload, cartItemKey } from "@/types/cart";

type ChatProduct = Product; // alias for backwards compat within this file

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; products?: ChatProduct[]; bundleProducts?: ChatProduct[]; timestamp: Date };
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

function firstString(...values: any[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function firstNumber(...values: any[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function normalizeSocialFeedProducts(data: any): ChatProduct[] {
  const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data?.products) ? data.products : [];

  return rawItems
    .map((item: any) => {
      const source = item?.product || item;
      const title = firstString(source?.title, source?.product_title, item?.productTitle);
      if (!title) return null;

      const price = firstNumber(source.price, source.price_ron, source.priceRON, source.product_price);
      const oldPrice = firstNumber(source.oldPrice, source.old_price_ron, source.oldPriceRON) || price;
      const numericPgId = Number(source.pgId || source.productId || source.product_id || item.productId || item.product_id || source.id);
      const videoUrl =
        item?.video?.hlsUrl ||
        item?.video?.mp4Url ||
        item?.video?.url ||
        item?.videoUrl ||
        source.hls_url ||
        source.video_url ||
        source.video ||
        undefined;
      const imageUrl = firstString(
        item?.video?.posterUrl,
        source.poster_url,
        source.thumbnail_url,
        source.product_image,
        source.image_url
      );
      const images = Array.isArray(source.images) && source.images.length
        ? source.images
        : imageUrl
          ? [imageUrl]
          : [];
      const discountPercent =
        Number(source.discountPercent) ||
        (oldPrice > price && price > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0);

      return {
        ...source,
        id: String(source.id || item.video_id || item.productId || item.product_id || item.id),
        pgId: Number.isFinite(numericPgId) && numericPgId > 0 ? numericPgId : source.pgId,
        aeProductId: source.aeProductId || source.ae_product_id,
        description: source.description || title,
        benefits: source.benefits || [],
        dealLabel: source.dealLabel || "AI Pick",
        whyBuy: source.whyBuy || "",
        warnings: source.warnings || [],
        title,
        price,
        oldPrice,
        discountPercent,
        rating: Number(source.rating) || 4.7,
        orders: Number(source.orders) || Number(source.orders_count) || Number(source.view_count) || item?.stats?.orders || 0,
        deliveryDays: Number(source.deliveryDays) || 7,
        images,
        video: videoUrl,
        hasVideo: Boolean(videoUrl || source.hasVideo || source.video_url || source.hls_url),
        category: source.category || "General",
        categoryId: Number(source.categoryId || source.category_id) || undefined,
        gradient: source.gradient || "from-orange-500 to-pink-500",
        qualityScore: Number(source.qualityScore || source.rank_score) || 8,
        likes: Number(source.likes) || Number(source.likes_count) || Number(source.like_count) || item?.stats?.likes,
        commentCount: Number(source.commentCount) || Number(source.comment_count) || item?.stats?.comments,
      } satisfies ChatProduct;
    })
    .filter(Boolean) as ChatProduct[];
}

async function fetchSocialFeed(offset: number, seed: number) {
  const res = await fetch(`/api/v1/feed?limit=15&offset=${offset}&seed=${seed}`);
  if (!res.ok) throw new Error("Social feed unavailable");
  return normalizeSocialFeedProducts(await res.json());
}

export default function ChatInterface({ 
  initialTrending = [], 
  initialBestValue = [], 
  initialTopRated = [] 
}: { 
  initialTrending?: ChatProduct[], 
  initialBestValue?: ChatProduct[], 
  initialTopRated?: ChatProduct[] 
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    try { 
      const saved = localStorage.getItem("aicv_chat"); 
      if (saved) { 
        const parsed = JSON.parse(saved); 
        setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))); 
      } 
    } catch {}
  }, []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [sessionId, setSessionId] = useState("");
  const [trendingProducts, setTrendingProducts] = useState<ChatProduct[]>(initialTrending);
  const [bestValueProducts, setBestValueProducts] = useState<ChatProduct[]>(initialBestValue);
  const [topRatedProducts, setTopRatedProducts] = useState<ChatProduct[]>(initialTopRated);
  const [dealsProducts, setDealsProducts] = useState<ChatProduct[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [feedProducts, setFeedProducts] = useState<ChatProduct[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ChatProduct | null>(null);
  const [lastShownProducts, setLastShownProducts] = useState<ChatProduct[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try { const saved = localStorage.getItem("aicv_cart"); if (saved) setCartItems(JSON.parse(saved)); } catch {}
  }, []);
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
  const [activeCatId, setActiveCatId] = useState<string|null>(null);
  const [catPage, setCatPage] = useState(1);
  const [catTotal, setCatTotal] = useState(0);
  const [catBrowsing, setCatBrowsing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const feedSeed = useRef(Math.floor(Math.random() * 100000));
  const dealsLoadingRef = useRef(false);
  const feedLoadingRef = useRef(false);

  const loadDeals = useCallback(async () => {
    if (dealsLoadingRef.current) return;
    dealsLoadingRef.current = true;
    setDealsLoading(true);
    try {
      const data = await fetch("/api/products?mode=deals&limit=50&sort=popular").then((r) => r.json());
      setDealsProducts(data.products || []);
    } finally {
      dealsLoadingRef.current = false;
      setDealsLoading(false);
    }
  }, []);

  const loadFeed = useCallback(async () => {
    if (feedLoadingRef.current) return;
    feedLoadingRef.current = true;
    setFeedLoading(true);
    try {
      setFeedProducts(await fetchSocialFeed(0, feedSeed.current));
    } finally {
      feedLoadingRef.current = false;
      setFeedLoading(false);
    }
  }, []);

  const loadMoreFeed = useCallback(async () => {
    if (feedLoadingRef.current) return;
    feedLoadingRef.current = true;
    setFeedLoading(true);
    try {
      const offset = feedProducts.length;
      const nextProducts = await fetchSocialFeed(offset, feedSeed.current);
      setFeedProducts((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        return [...prev, ...nextProducts.filter((p) => !existing.has(p.id))];
      });
    } finally {
      feedLoadingRef.current = false;
      setFeedLoading(false);
    }
  }, [feedProducts.length]);

  // Persist cart to localStorage
  useEffect(() => { try { localStorage.setItem("aicv_cart", JSON.stringify(cartItems)); } catch {} }, [cartItems]);
  // Persist chat messages (last 20) to localStorage
  useEffect(() => { try { const toSave = messages.slice(-20).map(m => ({ ...m, products: m.products?.slice(0, 4), bundleProducts: m.bundleProducts?.slice(0, 4) })); localStorage.setItem("aicv_chat", JSON.stringify(toSave)); } catch {} }, [messages]);

  useEffect(() => {
    setSessionId(Math.random().toString(36).slice(2) + Date.now().toString(36));
    fetch("/api/products?hierarchy=true").then(r=>r.json()).then(d=>setCategoryTree(d.hierarchy||[])).catch(()=>{});
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "feed") {
      setActiveTab("feed");
      loadFeed();
    }
  }, [loadFeed]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);
  useEffect(() => {
    if (activeTab === "deals" && dealsProducts.length === 0) loadDeals();
    if (activeTab === "feed" && feedProducts.length === 0) loadFeed();
  }, [activeTab, dealsProducts.length, feedProducts.length, loadDeals, loadFeed]);

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
    setCartItems((prev) => mergeIntoCart(prev, product, quantity));
    setSelectedProduct(null); setToastMessage(`🛒 ${quantity > 1 ? quantity + 'x ' : ''}${product.title.slice(0, 24)} adăugat în coș`); setFunnelStage("upsell");
    const newKey = `${product.pgId || product.id}:${product.skuId || "base"}`;
    const candidate = lastShownProducts.find((p) => `${p.pgId || p.id}:${p.skuId || "base"}` !== newKey && !cartItems.some((item) => cartItemKey(item) === `${p.pgId || p.id}:${p.skuId || "base"}`));
    if (candidate) setUpsellProduct(candidate);
    setTimeout(() => setToastMessage(""), 2500);
  }

  function findProductForAI(data: any) { const all = [...lastShownProducts, ...(data.products || []), ...(data.bundleProducts || [])]; if (data.productId) return all.find((p) => p.id === data.productId); if (data.productTitle) { const needle = String(data.productTitle).toLowerCase(); return all.find((p) => p.title.toLowerCase().includes(needle)); } return all.length === 1 ? all[0] : null; }

  async function runRealSearch(query: string) {
    const q = query.trim(); if (!q) return;
    setSearchLoading(true); setSuggestions([]); setInput(q); setFunnelStage(q.includes("ieftin") || q.includes("sub") ? "compare" : "discover");
    try { const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=24`); const data = await res.json(); setSearchResults(data.products || []); if (data.products?.length) setLastShownProducts(data.products); } finally { setSearchLoading(false); }
  }
  async function browseCategory(catPath: string, fromCatTab = false, page = 1, catId?: string) {
    const effectiveCatId = catId ?? (fromCatTab && catPath === catTitle ? activeCatId || undefined : undefined);
    if (fromCatTab) {
      if (page === 1) setCatLoading(true);
      setCatTitle(catPath); setActiveCatId(effectiveCatId || null); setCatPage(page); setCatBrowsing(true);
    } else { setSearchLoading(true); }
    setActiveSub(catPath);
    const offset = (page - 1) * 20;
    try {
      const catName = catPath.includes(" > ") ? catPath.split(" > ").pop()!.trim() : catPath;
      // Tag-based filtering (AI tags) vs category-based (AliExpress IDs)
      let catParam: string;
      if (effectiveCatId?.startsWith("tag:")) {
        catParam = `tag=${encodeURIComponent(effectiveCatId.replace("tag:", ""))}`;
      } else if (effectiveCatId) {
        catParam = `categoryId=${encodeURIComponent(effectiveCatId)}`;
      } else {
        catParam = `category=${encodeURIComponent(catName)}`;
      }
      const res = await fetch(`/api/products?${catParam}&limit=20&offset=${offset}&sort=${filterSort}&maxPrice=${filterMaxPrice}`);
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
      const data = await res.json(); if (!res.ok) throw new Error(data?.error || "Nu am putut căuta produsele.");
      setFunnelStage(data.intent === "add_to_cart" ? "cart" : data.intent === "checkout" ? "checkout" : data.intent === "find_cheaper" ? "compare" : data.intent === "search_product" ? "discover" : funnelStage);
      if (data.intent === "add_to_cart") { const product = findProductForAI(data); if (product) addToCart(product); }
      const products = data.products || []; const bundleProducts = data.bundleProducts || [];
      if (products.length || bundleProducts.length) setLastShownProducts([...products, ...bundleProducts]);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.reply || "Am căutat în magazin.", products, bundleProducts, timestamp: new Date() }]);
      if (data.sessionId) setSessionId(data.sessionId);
    } catch (error: any) { setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: error?.message || "A apărut o eroare.", timestamp: new Date() }]); } finally { setIsLoading(false); }
  }

  const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null);

  function updateQty(index: number, delta: number) { setCartItems((prev) => { const next = [...prev]; next[index] = { ...next[index], qty: Math.max(0, next[index].qty + delta) }; return next.filter((item) => item.qty > 0); }); }
  async function submitOrder() { if (cartItems.length === 0 || checkoutLoading) return; window.location.href = "/checkout"; }

  const isSwipeCandidate = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return !target.closest("button,a,input,textarea,select,[role='button'],.overflow-x-auto");
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isSwipeCandidate(e.target)) {
      setTouchStart(null);
      return;
    }
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
      <div className={`${compact ? "w-[10.5rem] sm:w-[11.5rem] shrink-0 carousel-card" : ""} overflow-hidden rounded-2xl bg-white border border-[#E5E5E5] md:hover:border-[#D1D1D6] md:hover:shadow-md transition-all`}>
        <a href={`/product/${product.pgId || product.id}`} className="block" style={{touchAction:"manipulation"}}>
        <div className="relative h-40 sm:h-44 bg-[#F7F7F8] product-card-image group">
          {product.images?.[0] ? <Image src={product.images[0]} alt={product.title} width={250} height={250} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Package className="text-[#D1D1D6]" /></div>}
          {product.hasVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm">
                <div className="ml-1 h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-[#0D0D0D]"></div>
              </div>
            </div>
          )}
          {product.discountPercent > 0 && <span className="absolute right-2 top-2 rounded-full bg-[#EF4444] px-2.5 py-1 text-[10px] font-black text-white z-10">-{product.discountPercent}%</span>}
          {badge && <span className={`absolute left-2 top-2 max-w-[80%] rounded-full px-2.5 py-1 text-[10px] font-black shadow z-10 ${commerceBadgeClass(badge)}`}>{badge}</span>}
          {vc > 1 && <span className="absolute left-2 bottom-2 rounded-full bg-[#0D0D0D]/80 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur z-10">{vc} variante</span>}
        </div>
        </a>
        <div className="p-3">
          <p className="line-clamp-2 text-[13px] sm:text-sm font-bold leading-tight text-[#0D0D0D] product-card-title">{product.title}</p>
          {insight && <p className="mt-1 text-[11px] font-semibold text-[#0D0D0D]">{insight}</p>}
          <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-[#6E6E80]">
            <span className="text-[#F59E0B]">★ {product.rating?.toFixed?.(1) || "4.8"}</span>
            <span>{product.orders || 0}+ comenzi</span>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-base sm:text-lg font-black text-[#0D0D0D] product-card-price">{product.price} lei</span>
            {product.oldPrice > product.price && <span className="text-[11px] text-[#6E6E80] line-through">{product.oldPrice} lei</span>}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-[#E5E5E5] overflow-hidden" onClick={e => e.stopPropagation()}>
              <button type="button" onClick={(e) => { e.stopPropagation(); updateCardQty(product.id, -1); }} className="qty-btn grid h-8 w-8 place-items-center text-[#6E6E80] hover:bg-[#F7F7F8] active:scale-90 transition-all text-sm font-bold" style={{touchAction:"manipulation"}}>−</button>
              <span className="w-6 text-center text-xs font-black text-[#0D0D0D]">{q}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); updateCardQty(product.id, 1); }} className="qty-btn grid h-8 w-8 place-items-center text-[#6E6E80] hover:bg-[#F7F7F8] active:scale-90 transition-all text-sm font-bold" style={{touchAction:"manipulation"}}>+</button>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); addToCart(product, q); setCardQty(prev => ({ ...prev, [product.id]: 1 })); }} className={`flex-1 rounded-lg py-2 text-xs font-bold ${THEME.classes.cartButton}`} style={{touchAction:"manipulation"}}>
              <ShoppingCart size={13} className="mr-1 inline" />{q > 1 ? `${q}x Coș` : "Coș"}
            </button>
          </div>
        </div>
      </div>
    );
  };
  const ProductSkeleton = ({ compact = false }) => <div className={`${compact ? "w-[10.5rem] sm:w-[11.5rem] shrink-0 carousel-card" : ""} overflow-hidden rounded-2xl bg-white border border-[#E5E5E5] animate-pulse`}><div className="h-40 sm:h-44 bg-[#F7F7F8] product-card-image"></div><div className="p-3"><div className="h-4 bg-[#F7F7F8] rounded mb-2 w-3/4"></div><div className="h-4 bg-[#F7F7F8] rounded mb-4 w-1/2"></div><div className="h-6 bg-[#F7F7F8] rounded w-1/3"></div><div className="mt-2 h-8 w-full rounded-lg bg-[#F7F7F8]"></div></div></div>;
  const ProductCarousel = ({ title, products, isLoading }: { title: string; products?: ChatProduct[]; isLoading?: boolean }) => { if (isLoading) return <div className="mt-4 text-left"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#6E6E80]">{title}</p><div className="flex snap-x gap-3 overflow-x-auto pb-3 no-scrollbar"><div className="snap-start"><ProductSkeleton compact /></div><div className="snap-start"><ProductSkeleton compact /></div><div className="snap-start"><ProductSkeleton compact /></div></div></div>; if (!products?.length) return null; return <div className="mt-4 text-left" onTouchStart={(e)=>e.stopPropagation()} onTouchEnd={(e)=>e.stopPropagation()}><p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#6E6E80]">{title}</p><div className="flex snap-x gap-3 overflow-x-auto pb-3 no-scrollbar">{products.map((p) => <div key={p.id} className="snap-start"><ProductCard product={p} compact /></div>)}</div></div>; };

  const TrendingHero = () => {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl bg-black relative h-[500px]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/80 z-10"></div>
        {trendingProducts.length > 0 && trendingProducts[0].video ? (
          <video src={trendingProducts[0].video} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover opacity-80" />
        ) : (
          <div className="absolute inset-0 bg-[#1a1a1a]"></div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full bg-[#EF4444] px-2 py-1 text-[10px] font-black text-white uppercase tracking-wider animate-pulse">🔥 Trending Today</span>
          </div>
          {trendingProducts.length > 0 && (
            <>
              <h2 className="text-2xl font-black text-white mb-1 drop-shadow-md">{trendingProducts[0].title}</h2>
              <div className="flex items-end gap-3 mb-4">
                <span className="text-3xl font-black text-[#0D0D0D] drop-shadow-md">{trendingProducts[0].price} lei</span>
              </div>
              <button onClick={() => router.push(`/product/${trendingProducts[0].pgId || trendingProducts[0].id}`)} className="w-full sm:w-auto rounded-xl bg-white px-8 py-3.5 text-sm font-black text-[#0D0D0D] hover:scale-105 transition-transform active:scale-95 shadow-xl">Cumpără acum</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return <main className={`min-h-screen ${THEME.classes.appBg}`}><div className={`relative mx-auto min-h-screen max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-6xl app-container ${THEME.classes.pageBg}`}>{activeTab !== "feed" && <header className="sticky top-0 z-30 border-b border-[#E5E5E5] bg-white/95 px-4 py-3 backdrop-blur-xl safe-top"><div className="flex items-center justify-between"><button type="button" onClick={() => setActiveTab("home")} className="flex items-center gap-2"><span className="text-lg font-black text-[#0D0D0D]">Swypik</span></button><div className="flex items-center gap-2"><button type="button" onClick={() => setActiveTab("cart")} className="relative rounded-xl bg-[#0D0D0D] p-2.5 text-white"><ShoppingCart size={18} />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#0D0D0D] text-[10px] font-black text-white">{cartCount}</span>}</button><button type="button" onClick={() => setShowMenu(true)} className="rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] p-2.5 text-[#0D0D0D] active:scale-90 transition-transform"><Menu size={18} /></button></div></div></header>}
    {/* Slide-out Menu */}
    {showMenu && <div className="fixed inset-0 z-50" onClick={() => setShowMenu(false)}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl" onClick={e => e.stopPropagation()} style={{animation: 'slideInRight 0.2s ease-out'}}>
        <div className="p-5 border-b border-[#E5E5E5] flex items-center justify-between">
          <h2 className="text-lg font-black text-[#0D0D0D]">Meniu</h2>
          <button onClick={() => setShowMenu(false)} className="rounded-lg p-1.5 hover:bg-[#F7F7F8] transition"><X size={20} /></button>
        </div>
        <div className="p-3 overflow-y-auto" style={{maxHeight: 'calc(100vh - 120px)'}}>
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#A1A1AA]">Descoperă</p>
          <a href="/explore" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Compass size={18} className="text-[#0D0D0D]" /> Feed
          </a>
          <a href="/challenges" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Trophy size={18} className="text-[#F59E0B]" /> Challenges
          </a>
          <a href="/onboarding" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Sparkles size={18} className="text-[#8B5CF6]" /> Alege interese
          </a>
          <a href="/collections" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Bookmark size={18} className="text-[#EC4899]" /> Colecțiile mele
          </a>
          <div className="my-2 border-t border-[#E5E5E5]" />
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#A1A1AA]">Cont</p>
          <a href="/account" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <User size={18} className="text-[#6E6E80]" /> Contul meu
          </a>
          <a href="/account" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <ClipboardList size={18} className="text-[#6E6E80]" /> Comenzile mele
          </a>
          <button onClick={() => { setActiveTab("cart"); setShowMenu(false); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <ShoppingCart size={18} className="text-[#6E6E80]" /> Coșul meu {cartCount > 0 && <span className="ml-auto rounded-full bg-[#0D0D0D] px-2 py-0.5 text-[10px] font-bold text-white">{cartCount}</span>}
          </button>
          <div className="my-2 border-t border-[#E5E5E5]" />
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#A1A1AA]">Creator</p>
          <a href="/creator" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Zap size={18} className="text-[#0D0D0D]" /> Dashboard Creator
          </a>
          <a href="/creator/upload" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Upload size={18} className="text-[#6E6E80]" /> Încarcă clip
          </a>
          <a href="/creator/rewards" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Trophy size={18} className="text-[#F59E0B]" /> SWYP Points
          </a>
          <a href="/creator/videos" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Flame size={18} className="text-[#EF4444]" /> Clipurile mele
          </a>
          <a href="/creator/earnings" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#0D0D0D] hover:bg-[#F7F7F8] transition">
            <Star size={18} className="text-[#6E6E80]" /> Câștiguri
          </a>
          <div className="my-2 border-t border-[#E5E5E5]" />
          <a href="/admin" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-[#A1A1AA] hover:bg-[#F7F7F8] transition">
            <Shield size={18} /> Admin
          </a>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-[#E5E5E5]">
          <p className="text-[10px] font-bold text-[#A1A1AA] uppercase tracking-widest text-center">Swypik © 2026</p>
        </div>
      </div>
    </div>}
    <section className={activeTab === "feed" ? "h-[100dvh]" : "min-h-[calc(100dvh-132px)] pb-36"} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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
              {suggestions.length > 0 && <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl bg-white shadow-lg border border-[#E5E5E5]">{suggestions.map((s) => <button type="button" key={`${s.type}-${s.label}`} onClick={() => runRealSearch(s.label)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#0D0D0D] hover:bg-[#F7F7F8]"><span>{s.label}</span><span className="rounded-full bg-[#F7F7F8] px-2 py-0.5 text-[10px] font-bold text-[#6E6E80]">{s.type}</span></button>)}</div>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => runRealSearch(input)} disabled={!input.trim() || searchLoading} className={`rounded-xl py-3.5 font-bold disabled:opacity-50 ${THEME.classes.primaryButton}`}>Caută</button>
              <button type="button" onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading} className="rounded-xl bg-[#0D0D0D] py-3.5 font-bold text-white disabled:opacity-50">Întreabă AI</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((qa) => <button type="button" key={qa.label} onClick={() => sendMessage(qa.query)} className="rounded-full bg-white border border-[#E5E5E5] px-3.5 py-2 text-xs font-bold text-[#0D0D0D] hover:border-[#0D0D0D] hover:text-[#0D0D0D] active:scale-95 transition-all">{qa.label}</button>)}
          </div>
          <div className="mt-4">
            <button type="button" onClick={() => setActiveTab("categories")} className="w-full rounded-xl bg-[#0D0D0D] py-3 font-bold text-white flex items-center justify-center gap-2"><Grid3x3 size={16} /> Explorează categorii</button>
          </div>
          {searchLoading ? <ProductCarousel title={`Se caută rezultate...`} isLoading={true} /> : searchResults.length > 0 && <ProductCarousel title={`Rezultate (${searchResults.length})`} products={searchResults} />}
          <TrendingHero />
          <ProductCarousel title="✨ Creator Picks (Trending)" products={topRatedProducts.slice(0, 10)} />
          <ProductCarousel title="🏆 Best Value" products={bestValueProducts.slice(0, 20)} />
          <ProductCarousel title="⭐ Top Rated (4.7+)" products={topRatedProducts.slice(10, 30)} />
        </div>
      )}
      {activeTab === "categories" && <div className="px-4 pt-4">{catBrowsing ? <div><div className="flex items-center gap-3 mb-4"><button type="button" onClick={() => { setCatBrowsing(false); setCatProducts([]); setCatTitle(""); setActiveCatId(null); }} className="grid h-10 w-10 place-items-center rounded-xl bg-[#F7F7F8] border border-[#E5E5E5]"><ChevronDown size={16} className="rotate-90" /></button><div className="flex-1"><p className="text-lg font-black text-[#0D0D0D]">{catTitle.split(" > ").map(p => translateCategory(p.trim())).join(" → ")}</p><p className="text-xs text-[#6E6E80]">{catTotal} produse</p></div><button type="button" onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-bold border transition-all ${showFilters ? "bg-[#0D0D0D] text-white border-[#0D0D0D]" : "bg-white text-[#0D0D0D] border-[#E5E5E5]"}`}><SlidersHorizontal size={14} /></button></div>{showFilters && <div className="mb-4 rounded-xl bg-[#F7F7F8] p-4 border border-[#E5E5E5] animate-slideDown space-y-3"><div><label className="text-xs font-bold text-[#6E6E80] uppercase">Sortare</label><div className="mt-1 flex flex-wrap gap-1.5">{[{v:"popular",l:"Popular"},{v:"price_asc",l:"Preț ↑"},{v:"price_desc",l:"Preț ↓"},{v:"newest",l:"Noi"},{v:"discount",l:"Reduceri"}].map(s=><button type="button" key={s.v} onClick={()=>{setFilterSort(s.v); browseCategory(catTitle, true, 1);}} className={`sub-chip chip-btn rounded-lg px-3.5 py-2 text-xs font-semibold ${filterSort===s.v?"active":""}`}>{s.l}</button>)}</div></div><div><label className="text-xs font-bold text-[#6E6E80] uppercase">Preț maxim: {filterMaxPrice} lei</label><input type="range" min={20} max={2000} step={10} value={filterMaxPrice} onChange={e=>{setFilterMaxPrice(Number(e.target.value));}} onMouseUp={()=>browseCategory(catTitle,true,1)} onTouchEnd={()=>browseCategory(catTitle,true,1)} className="mt-1 w-full accent-[#0D0D0D] h-8" /></div></div>}<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 product-grid">{catProducts.map(p => <ProductCard key={p.id} product={p} />)}{catLoading && <><ProductSkeleton /><ProductSkeleton /><ProductSkeleton /><ProductSkeleton /></>}</div>{!catLoading && catProducts.length < catTotal && <button type="button" onClick={() => browseCategory(catTitle, true, catPage + 1)} className="mt-5 w-full rounded-xl bg-[#0D0D0D] py-4 text-sm font-bold text-white shadow-lg">Mai afișează +20 produse (din {catTotal})</button>}</div> : <><div className="flex items-center justify-between mb-4"><h2 className="text-2xl font-black text-[#0D0D0D]">Categorii</h2></div><div className="space-y-2">{categoryTree.map((cat:any)=><div key={cat.name} className="rounded-xl border border-[#E5E5E5] overflow-hidden"><button type="button" onClick={()=>{setExpandedCat(expandedCat===cat.name?null:cat.name);}} className={`w-full flex items-center justify-between p-4 text-left font-bold transition-colors ${expandedCat===cat.name?"bg-[#0D0D0D] text-white":"bg-white text-[#0D0D0D] hover:bg-[#F7F7F8]"}`}><span className="text-sm">{translateCategory(cat.name)}</span><div className="flex items-center gap-2"><span className="text-[10px] opacity-60">{cat.count.toLocaleString()}</span><ChevronDown size={16} className={`transition-transform ${expandedCat===cat.name?"rotate-180":""}`}/></div></button>{expandedCat===cat.name&&<div className="p-3 bg-[#FAFAFA] border-t border-[#E5E5E5] animate-slideDown"><div className="grid grid-cols-2 md:grid-cols-3 gap-2">{(cat.children || []).map((mid:any)=><button type="button" key={mid.id || mid.name} onClick={()=>browseCategory(`${cat.name} > ${mid.name}`,true,1,mid.id)} className="rounded-xl p-3.5 text-left border-2 transition-all bg-white border-[#E5E5E5] hover:border-[#0D0D0D] active:scale-95"><span className="text-xs font-bold block">{translateCategory(mid.name)}</span><span className="text-[10px] opacity-70">{mid.count.toLocaleString()} produse</span></button>)}</div></div>}</div>)}</div></>}</div>}
      {activeTab === "chat" && <div className="px-4 pt-4"><div className="space-y-4">{(messages.length === 0 ? [AI_WELCOME] : messages).map((m) => <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}><div className={`inline-block max-w-[88%] rounded-2xl px-4 py-3 text-sm font-medium ${m.role === "user" ? "bg-[#0D0D0D] text-white" : "bg-[#F7F7F8] text-[#0D0D0D] border border-[#E5E5E5]"}`}>{m.role === "assistant" && <div className="mb-1 flex items-center gap-1 text-xs font-bold text-[#0D0D0D]"><Bot size={13} /> AI Shopping Assistant</div>}<p className="whitespace-pre-wrap">{m.content}</p></div>{m.role === "assistant" && <><ProductCarousel title="Recomandate pentru tine" products={m.products} />{(m.bundleProducts?.length || 0) > 0 && <div className="mt-3 rounded-2xl border border-[#0D0D0D]/30 bg-gradient-to-br from-[#F0FDF4] to-[#ECFDF5] p-4"><div className="flex items-center justify-between mb-3"><p className="text-xs font-black uppercase tracking-widest text-[#0D0D0D]">🎁 Bundle AI — Completează setul</p><p className="text-xs font-bold text-[#6E6E80]">{(() => { const t = (m.bundleProducts || []).reduce((s, p) => s + p.price, 0); const o = (m.bundleProducts || []).reduce((s, p) => s + (p.oldPrice || p.price), 0); return o > t ? `Economisești ${Math.round(o - t)} lei` : `Total: ${Math.round(t)} lei`; })()}</p></div><div className="space-y-2">{(m.bundleProducts || []).map(bp => <div key={bp.id} className="flex items-center gap-3 rounded-xl bg-white/80 p-2.5 border border-[#E5E5E5]/50"><Image src={bp.images?.[0]||""} alt="" width={48} height={48} className="h-12 w-12 rounded-lg object-cover shrink-0" /><div className="flex-1 min-w-0"><p className="text-xs font-bold text-[#0D0D0D] truncate">{bp.title}</p><p className="text-xs font-bold text-[#0D0D0D]">{bp.price} lei {bp.oldPrice > bp.price && <span className="text-[#A1A1AA] line-through ml-1">{bp.oldPrice}</span>}</p></div><button type="button" onClick={() => addToCart(bp)} className="shrink-0 rounded-lg bg-[#0D0D0D] px-2.5 py-1.5 text-[10px] font-black text-white active:scale-90 transition-transform">+ Coș</button></div>)}</div><button type="button" onClick={() => { (m.bundleProducts || []).forEach(bp => addToCart(bp)); setToastMessage("🎁 Tot bundle-ul adăugat!"); setTimeout(() => setToastMessage(""), 2500); }} className="mt-3 w-full rounded-xl bg-[#0D0D0D] py-3 text-xs font-black text-white active:scale-95 transition-transform"><ShoppingCart size={13} className="inline mr-1.5" />Adaugă tot bundle-ul — {Math.round((m.bundleProducts || []).reduce((s, p) => s + p.price, 0))} lei</button></div>}{(m.products?.length || 0) > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{[{label:"🔄 Arată altele",query:"arată-mi altceva"},{label:"💰 Mai ieftin",query:"vreau mai ieftin"},{label:"⭐ Top calitate",query:"arată-mi doar top calitate"},{label:"🆕 Mai noi",query:"arată-mi produse mai noi"},{label:"⚖️ Compară top 2",query:"compară primele 2 produse"}].map(chip => <button type="button" key={chip.label} onClick={() => sendMessage(chip.query)} className="rounded-full bg-white border border-[#E5E5E5] px-3 py-1.5 text-[11px] font-bold text-[#6E6E80] hover:border-[#0D0D0D] hover:text-[#0D0D0D] active:scale-95 transition-all">{chip.label}</button>)}</div>}</>}</div>)}{isLoading && <div className="rounded-xl bg-[#F7F7F8] p-3 text-sm font-medium text-[#6E6E80] border border-[#E5E5E5]">🧠 AI analizează și caută cele mai bune opțiuni...</div>}{messages.length > 0 && !isLoading && <button type="button" onClick={() => { setMessages([]); try { localStorage.removeItem("aicv_chat"); } catch {} }} className="mx-auto block text-[10px] font-bold text-[#A1A1AA] hover:text-[#6E6E80] mt-2">🗑️ Șterge conversația</button>}<div ref={messagesEndRef} /></div></div>}
      {activeTab === "deals" && <div className="px-4 pt-4"><h2 className="mb-3 text-2xl font-black text-[#0D0D0D]">Reduceri</h2>{dealsLoading ? <p className="py-20 text-center font-medium text-[#6E6E80]">Se încarcă...</p> : <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 product-grid">{dealsProducts.map((p) => <ProductCard key={p.id} product={p} />)}</div>}</div>}
      {activeTab === "feed" && <ProductFeed products={feedProducts} onAddToCart={(p: any, q?: number) => addToCart(p, q || 1)} onLoadMore={loadMoreFeed} onClose={() => setActiveTab("home")} isLoading={feedLoading} />}
      {activeTab === "cart" && (
        <div className="px-4 pt-4 pb-10">
          <h2 className="mb-4 text-2xl font-black text-[#0D0D0D]">Coșul tău</h2>
          {cartItems.length === 0 ? <p className="py-20 text-center font-medium text-[#6E6E80]">Coșul este gol.</p> : (
            <>
              <div className="space-y-3">
                {cartItems.map((item, i) => (
                  <div key={item.product.id} className="flex gap-3 rounded-2xl bg-[#F7F7F8] p-3 border border-[#E5E5E5]">
                    {item.product.images?.[0] && <Image src={item.product.images[0]} alt="" width={64} height={64} className="h-16 w-16 rounded-xl object-cover" />}
                    <div className="flex-1">
                      <p className="line-clamp-2 text-sm font-bold text-[#0D0D0D]">{item.product.title}</p>
                      <p className="text-xs font-bold text-[#0D0D0D]">{item.product.price * item.qty} lei</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateQty(i, -1)} className="grid h-8 w-8 place-items-center rounded-full bg-[#E5E5E5] font-bold text-[#0D0D0D] hover:bg-[#D1D1D6] active:scale-90 transition-transform">-</button>
                      <span className="w-4 text-center font-bold">{item.qty}</span>
                      <button type="button" onClick={() => updateQty(i, 1)} className="grid h-8 w-8 place-items-center rounded-full bg-[#E5E5E5] font-bold text-[#0D0D0D] hover:bg-[#D1D1D6] active:scale-90 transition-transform">+</button>
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
                  <span className="text-[#0D0D0D]">{cartTotal} lei</span>
                </div>
                <button type="button" onClick={submitOrder} disabled={checkoutLoading} className={`mt-4 w-full rounded-xl py-4 font-bold disabled:opacity-50 ${THEME.classes.cartButton} active:scale-[0.98] transition-transform`}>
                  {checkoutLoading ? "Se procesează..." : `Finalizează comanda — ${cartTotal} lei`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
    {activeTab === "chat" && <div className="fixed z-30 w-full max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-6xl left-1/2 -translate-x-1/2 border-t border-[#E5E5E5] bg-white/95 px-3 py-2 backdrop-blur-xl chat-input-bar" onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}><div className={`flex gap-2 rounded-xl p-2 ${THEME.classes.softInput}`}><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} className="flex-1 bg-transparent px-2 text-base font-medium text-[#0D0D0D] outline-none placeholder:text-[#A1A1AA]" placeholder="Scrie ce cauți..." /><button type="button" onClick={() => sendMessage()} disabled={!input.trim() || isLoading} className="grid h-10 w-10 place-items-center rounded-xl bg-[#0D0D0D] text-white disabled:opacity-40"><Send size={16} /></button></div></div>}{(activeTab as string) !== "feed" && <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-6xl -translate-x-1/2 border-t border-[#E5E5E5] bg-white/95 px-4 py-2 backdrop-blur-xl bottom-nav"><div className="flex justify-around text-[10px] font-bold text-[#6E6E80]"><NavBtn icon={<Home size={20} />} label="Acasă" active={activeTab === "home"} onClick={() => setActiveTab("home")} /><NavBtn icon={<Grid3x3 size={20} />} label="Categorii" active={activeTab === "categories"} onClick={() => { setActiveTab("categories"); setCatBrowsing(false); }} /><NavBtn icon={<Compass size={20} />} label="Feed" active={false} onClick={() => router.push("/explore")} /><NavBtn icon={<Trophy size={20} />} label="Challenges" active={false} onClick={() => router.push("/challenges")} /><NavBtn icon={<MessageCircle size={20} />} label="Chat" active={activeTab === "chat"} onClick={() => setActiveTab("chat")} /><NavBtn icon={<ShoppingCart size={20} />} label={`Coș ${cartCount ? `(${cartCount})` : ""}`} active={activeTab === "cart"} onClick={() => setActiveTab("cart")} /></div></nav>}
    {upsellProduct && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setUpsellProduct(null)}><div className="w-full max-w-lg rounded-t-[2rem] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#0D0D0D]">Completează bundle-ul</p><h3 className="text-2xl font-black text-[#0D0D0D]">Mai vrei și asta?</h3><p className="mt-1 text-sm font-medium text-[#6E6E80]">Merge bine cu ce ai pus în coș.</p></div><button type="button" onClick={() => setUpsellProduct(null)}><X size={18} /></button></div><div className="mt-4 flex gap-3 rounded-2xl bg-[#F7F7F8] p-3 border border-[#E5E5E5]">{upsellProduct.images?.[0] && <Image src={upsellProduct.images[0]} alt="" width={96} height={96} className="h-24 w-24 rounded-xl object-cover" />}<div className="flex-1"><p className="line-clamp-2 text-sm font-bold">{upsellProduct.title}</p><p className="mt-1 text-xl font-black text-[#0D0D0D]">{upsellProduct.price} lei</p><button type="button" onClick={() => { addToCart(upsellProduct); setUpsellProduct(null); }} className={`mt-2 w-full rounded-xl py-2 font-bold ${THEME.classes.cartButton}`}>Adaugă la bundle</button></div></div><button type="button" onClick={() => setUpsellProduct(null)} className="mt-3 w-full rounded-xl bg-[#F7F7F8] py-3 font-bold text-[#6E6E80]">Nu acum</button></div></div>}
    {showBundleSheet && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setShowBundleSheet(false)}><div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#0D0D0D]">AI Bundle</p><h3 className="text-2xl font-black">Bundle complet</h3><p className="text-sm font-medium text-[#6E6E80]">Total: {Math.round(bundleTotal)} lei {bundleSavings > 0 ? `• economisești ${bundleSavings} lei` : ""}</p></div><button type="button" onClick={() => setShowBundleSheet(false)}><X size={18} /></button></div><div className="mt-4 space-y-3">{bundleCandidates.map((p) => <div key={p.id} className="flex gap-3 rounded-2xl bg-[#F7F7F8] p-3 border border-[#E5E5E5]">{p.images?.[0] && <Image src={p.images[0]} alt="" width={64} height={64} className="h-16 w-16 rounded-xl object-cover" />}<div className="flex-1"><p className="line-clamp-2 text-sm font-bold">{p.title}</p><p className="text-sm font-bold text-[#0D0D0D]">{p.price} lei</p></div><button type="button" onClick={() => addToCart(p)} className="rounded-xl bg-[#0D0D0D] px-3 text-xs font-bold text-white">+ Coș</button></div>)}</div></div></div>}
    {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={() => addToCart(selectedProduct)} />}{toastMessage && <div className="fixed left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0D0D0D] px-5 py-2.5 text-sm font-bold text-white shadow-xl toast-position">{toastMessage}</div>}</div></main>;
}

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex flex-col items-center gap-0.5 transition-colors ${active ? "text-[#0D0D0D]" : "text-[#A1A1AA]"}`} style={{touchAction:'manipulation'}}>{icon}{label}</button>; }
function ProductModal({ product, onClose, onAddToCart }: { product: ChatProduct; onClose: () => void; onAddToCart: () => void }) { const insights: string[] = []; if (product.rating >= 4.7 && !product.isEstimatedSocial) insights.push(`⭐ Rating ${product.rating}/5 — calitate peste medie`); if (!product.isEstimatedSocial && product.orders >= 500) insights.push(`✅ ${product.orders.toLocaleString()}+ comenzi — seller de încredere`); else if (!product.isEstimatedSocial && product.orders >= 100) insights.push(`📦 ${product.orders}+ vândute — produs verificat`); if (product.discountPercent >= 20) insights.push(`💰 Reducere reală de ${product.discountPercent}% față de prețul standard`); if (product.qualityScore >= 9) insights.push('🏆 Best value în categoria sa'); if (product.deliveryDays <= 5) insights.push(`🚀 Livrare rapidă — ${product.deliveryDays} zile`); return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}><div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex justify-between"><span className="rounded-full bg-[#F7F7F8] px-3 py-1 text-xs font-bold text-[#6E6E80]">{product.category}</span><button type="button" onClick={onClose}><X size={18} /></button></div>{product.images?.[0] && <Image src={product.images[0]} alt={product.title} width={640} height={640} className="h-64 w-full rounded-2xl object-cover" />}<h2 className="mt-4 text-2xl font-black text-[#0D0D0D]">{product.title}</h2><div className="mt-2 flex gap-3 text-sm font-medium text-[#6E6E80]"><span className="text-[#F59E0B]"><Star size={14} className="inline" fill="currentColor" /> {product.rating}</span>{product.socialProofLabel ? <span>{product.socialProofLabel}</span> : <span>Popular</span>}<span><Truck size={14} className="inline" /> {product.deliveryDays} zile</span></div><div className="mt-3"><span className="text-3xl font-black text-[#0D0D0D]">{product.price} lei</span>{product.oldPrice > product.price && <span className="ml-2 text-[#6E6E80] line-through">{product.oldPrice} lei</span>}</div>{insights.length > 0 && <div className="mt-4 rounded-2xl bg-gradient-to-br from-[#F0FDF4] to-[#ECFDF5] border border-[#BBF7D0] p-4"><p className="text-xs font-black uppercase tracking-widest text-[#0D0D0D] mb-2">🧠 De ce merită — AI Analysis</p><div className="space-y-1.5">{insights.map((ins, i) => <p key={i} className="text-sm font-medium text-[#0D0D0D]">{ins}</p>)}</div></div>}<p className="mt-4 text-sm font-medium leading-relaxed text-[#6E6E80]">{product.description}</p><button type="button" onClick={onAddToCart} className={`mt-4 w-full rounded-xl py-4 font-bold ${THEME.classes.cartButton}`}>Adaugă în coș — {product.price} lei</button><a href={`/product/${product.pgId || product.id}`} className="mt-2 block w-full rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] py-3 text-center text-sm font-bold text-[#0D0D0D] hover:bg-[#ECECF1] transition-colors">Vezi toate detaliile →</a></div></div>; }
