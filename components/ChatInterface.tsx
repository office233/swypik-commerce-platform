"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot, ChevronDown, MessageCircle, Package, Search,
  Send, ShoppingBag, ShoppingCart, Sparkles, Star,
  Truck, X, Zap, Home, Tag, User, Flame, Grid, ChevronRight,
} from "lucide-react";
import ProductFeed from "./ProductFeed";

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
  timestamp: Date;
};

type CartItem = { product: ChatProduct; qty: number };

type ShopifyCollection = {
  id: number;
  title: string;
  handle: string;
  emoji: string;
  productsCount: number;
};

type GroupedCategory = {
  parent: string;
  emoji: string;
  id: number | null;
  subcategories: ShopifyCollection[];
  totalProducts: number;
};

const FALLBACK_ACTIONS = [
  { label: "👗 Haine femei", query: "rochii damă elegante" },
  { label: "👔 Haine bărbați", query: "tricouri streetwear bărbați" },
  { label: "💎 Bijuterii", query: "coliere și brățări" },
  { label: "💄 Beauty", query: "seruri și skincare" },
  { label: "🏠 Casă & Grădină", query: "organizare casă" },
  { label: "👜 Genți", query: "genți damă" },
  { label: "🧸 Copii", query: "jucării copii" },
  { label: "🐾 Animale", query: "accesorii animale" },
];

const CATEGORY_ICONS: Record<string, string> = {
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
  const [activeTab, setActiveTab] = useState<"home" | "chat" | "deals" | "feed" | "cart">("home");
  const [dealsProducts, setDealsProducts] = useState<ChatProduct[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [browseProducts, setBrowseProducts] = useState<ChatProduct[]>([]);
  const [browseTitle, setBrowseTitle] = useState("");
  const [trendingProducts, setTrendingProducts] = useState<ChatProduct[]>([]);
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });
  const [toastMessage, setToastMessage] = useState("");
  const [shopifyCollections, setShopifyCollections] = useState<{ main: ShopifyCollection[]; all: ShopifyCollection[]; grouped: GroupedCategory[] }>({ main: [], all: [], grouped: [] });
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [feedProducts, setFeedProducts] = useState<ChatProduct[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSessionId(crypto.randomUUID());

    fetch("/api/shopify-products?mode=trending&limit=20")
      .then((r) => r.json())
      .then((d) => setTrendingProducts(d.products || []))
      .catch(() => {});

    fetch("/api/collections")
      .then((r) => r.json())
      .then((d) => {
        if (d.main) {
          setShopifyCollections({
            main: d.main,
            all: d.all || [],
            grouped: d.grouped || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      const diff = end.getTime() - now.getTime();

      setCountdown({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
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

  useEffect(() => {
    if (
      activeTab === "deals" &&
      dealsProducts.length === 0 &&
      browseProducts.length === 0 &&
      !dealsLoading
    ) {
      loadDeals();
    }
  }, [activeTab]);

  async function sendMessage(text?: string, directSearchQuery?: string) {
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
          directCjQuery: directSearchQuery || undefined,
          chatHistory: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Request failed");
      }

      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "Nu am găsit nimic relevant.",
        products: data.products,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMsg]);

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error?.message || "Oops! Ceva nu a mers bine.",
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
  const [checkoutForm, setCheckoutForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    county: "",
  });
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  function addToCart(product: ChatProduct) {
    setCartItems((prev) => {
      const idx = prev.findIndex((c) => c.product.id === product.id);

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          qty: next[idx].qty + 1,
        };
        return next;
      }

      return [...prev, { product, qty: 1 }];
    });

    setSelectedProduct(null);
    setToastMessage(`🛒 ${product.title.substring(0, 20)}... adăugat!`);

    setTimeout(() => setToastMessage(""), 3000);
  }

  function updateQty(index: number, delta: number) {
    setCartItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        qty: Math.max(0, next[index].qty + delta),
      };
      return next.filter((c) => c.qty > 0);
    });
  }

  function removeFromCart(index: number) {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  }

  const cartTotal = cartItems.reduce((sum, c) => sum + c.product.price * c.qty, 0);
  const cartCount = cartItems.reduce((sum, c) => sum + c.qty, 0);

  async function loadDeals() {
    if (dealsProducts.length > 0 || dealsLoading) return;

    setDealsLoading(true);

    try {
      const res = await fetch("/api/shopify-products?mode=trending&limit=50");
      const data = await res.json();
      setDealsProducts(data.products || []);
    } catch {
    } finally {
      setDealsLoading(false);
    }
  }

  async function loadCategory(label: string, collectionIdOrQuery: string) {
    setBrowseTitle(label);
    setBrowseProducts([]);
    setActiveTab("deals");
    setDealsLoading(true);

    try {
      const isCollectionId = /^\d+$/.test(collectionIdOrQuery);

      const url = isCollectionId
        ? `/api/shopify-products?collection=${collectionIdOrQuery}&limit=50`
        : `/api/shopify-products?search=${encodeURIComponent(collectionIdOrQuery)}&limit=50`;

      const res = await fetch(url);
      const data = await res.json();

      setBrowseProducts(data.products || []);
    } catch {
    } finally {
      setDealsLoading(false);
    }
  }

  async function loadFeed() {
    if (feedProducts.length > 0 || feedLoading) return;

    setFeedLoading(true);

    try {
      const res = await fetch("/api/shopify-products?mode=feed&limit=60");
      const data = await res.json();
      setFeedProducts(data.products || []);
    } catch {
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
    } catch {
    } finally {
      setFeedLoading(false);
    }
  }

  return null;
}
