"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Heart, MessageCircle, ShoppingCart, Share2, ChevronUp,
  ChevronDown, Volume2, VolumeX, X, Star, Truck, Package,
  ChevronLeft, ChevronRight, Plus, Minus, Music,
} from "lucide-react";

/* ─── Types ─── */
type FeedProduct = {
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

type CartItem = { product: FeedProduct; qty: number };

/* ─── Fake comments (psychological social proof) ─── */
const FAKE_COMMENTS = [
  { name: "Maria S.", avatar: "M", text: "Super calitate! L-am comandat de 2 ori deja 😍", time: "2h", color: "bg-pink-500/20 text-pink-400" },
  { name: "Andrei P.", avatar: "A", text: "A ajuns repede, exact ca în poze. Recomand!", time: "5h", color: "bg-emerald-500/20 text-emerald-400" },
  { name: "Elena D.", avatar: "E", text: "Prețul e imbatabil, nu găsești mai ieftin nicăieri 🔥", time: "8h", color: "bg-violet-500/20 text-violet-400" },
  { name: "Ionuț M.", avatar: "I", text: "Am luat pentru toată familia, toți mulțumiți!", time: "1d", color: "bg-amber-500/20 text-amber-400" },
  { name: "Cristina R.", avatar: "C", text: "Calitate premium la preț de nimic. WOW!", time: "1d", color: "bg-cyan-500/20 text-cyan-400" },
  { name: "Vlad T.", avatar: "V", text: "Al 3-lea produs de aici, never disappointed 💪", time: "2d", color: "bg-orange-500/20 text-orange-400" },
  { name: "Ana B.", avatar: "A", text: "Cadou perfect! Ambalaj frumos, calitate top", time: "3d", color: "bg-rose-500/20 text-rose-400" },
  { name: "Mihai L.", avatar: "M", text: "Nu mă așteptam la o asemenea calitate la prețul ăsta!", time: "3d", color: "bg-teal-500/20 text-teal-400" },
];

const LIKE_COUNTS_BASE = [142, 89, 234, 56, 312, 178, 423, 67, 198, 345, 91, 267, 154, 88, 456, 203];

type ProductFeedProps = {
  products: FeedProduct[];
  onAddToCart: (product: FeedProduct) => void;
  onViewDetails?: (product: FeedProduct) => void;
  isLoading: boolean;
};

export default function ProductFeed({ products, onAddToCart, onViewDetails, isLoading }: ProductFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [showComments, setShowComments] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [likeAnimation, setLikeAnimation] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [doubleTapTimer, setDoubleTapTimer] = useState<number | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);

  // Initialize like counts
  useEffect(() => {
    const counts: Record<string, number> = {};
    products.forEach((p, i) => {
      counts[p.id] = LIKE_COUNTS_BASE[i % LIKE_COUNTS_BASE.length];
    });
    setLikeCounts(counts);
  }, [products]);

  // Ambient shopping music generator (Web Audio API — no external files needed)
  function startAmbientMusic() {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    // Master volume
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.08;
    masterGain.connect(ctx.destination);

    // Create warm pad (Cmaj7 chord — psychologically calming, associated with luxury)
    const notes = [261.63, 329.63, 392.0, 493.88]; // C4, E4, G4, B4
    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.15;

      // Slow tremolo — adds "breathing" feel, very relaxing
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.3 + Math.random() * 0.2; // Slow ~0.3Hz
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
    });

    // Subtle rhythm — soft kick at ~72 BPM (relaxation zone)
    function playKick() {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }

    // 72 BPM = 833ms per beat
    const kickInterval = setInterval(() => {
      if (audioCtxRef.current && audioCtxRef.current.state === "running") {
        playKick();
      }
    }, 833);

    // Store cleanup ref
    (ctx as any)._kickInterval = kickInterval;
  }

  function stopAmbientMusic() {
    if (audioCtxRef.current) {
      clearInterval((audioCtxRef.current as any)._kickInterval);
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAmbientMusic();
  }, []);

  const toggleMusic = useCallback(() => {
    if (isMuted) {
      startAmbientMusic();
      setIsMuted(false);
    } else {
      stopAmbientMusic();
      setIsMuted(true);
    }
  }, [isMuted]);

  // Touch handling for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { y: e.touches[0].clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const deltaY = touchStartRef.current.y - e.changedTouches[0].clientY;
    const deltaTime = Date.now() - touchStartRef.current.time;

    if (Math.abs(deltaY) > 50 && deltaTime < 500) {
      if (deltaY > 0 && currentIndex < products.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setCurrentImageIndex(0);
        setShowDetails(false);
        setShowComments(false);
        setSelectedSize(null);
      } else if (deltaY < 0 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        setCurrentImageIndex(0);
        setShowDetails(false);
        setShowComments(false);
        setSelectedSize(null);
      }
    }
    touchStartRef.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" && currentIndex < products.length - 1) {
        setCurrentIndex((i) => i + 1);
        setCurrentImageIndex(0);
      } else if (e.key === "ArrowUp" && currentIndex > 0) {
        setCurrentIndex((i) => i - 1);
        setCurrentImageIndex(0);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, products.length]);

  // Double tap to like
  const handleDoubleTap = (productId: string) => {
    if (doubleTapTimer) {
      // Double tap detected!
      clearTimeout(doubleTapTimer);
      setDoubleTapTimer(null);
      toggleLike(productId);
    } else {
      const timer = window.setTimeout(() => {
        setDoubleTapTimer(null);
      }, 300);
      setDoubleTapTimer(timer);
    }
  };

  const toggleLike = (productId: string) => {
    const wasLiked = likes[productId];
    setLikes((prev) => ({ ...prev, [productId]: !wasLiked }));
    setLikeCounts((prev) => ({
      ...prev,
      [productId]: (prev[productId] || 0) + (wasLiked ? -1 : 1),
    }));
    if (!wasLiked) {
      setLikeAnimation(productId);
      setTimeout(() => setLikeAnimation(null), 1000);
      // Start music on first interaction
      if (isMuted) {
        startAmbientMusic();
        setIsMuted(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="feed-container flex items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-white/40 font-medium">Se încarcă produsele...</p>
          <p className="mt-1 text-xs text-white/20">Pregătim cele mai bune oferte pentru tine</p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="feed-container flex items-center justify-center">
        <div className="text-center px-8">
          <Package className="mx-auto mb-4 text-white/20" size={48} />
          <p className="text-white/50 font-bold">Încă nu sunt produse</p>
          <p className="text-white/30 text-sm mt-1">Caută ceva din chat sau apasă pe o categorie!</p>
        </div>
      </div>
    );
  }

  const product = products[currentIndex];
  if (!product) return null;

  const productComments = FAKE_COMMENTS.slice(0, 3 + (currentIndex % 5));
  const fakeViewers = Math.floor(Math.random() * 30) + 8;
  const fakeSizes = ["XS", "S", "M", "L", "XL", "XXL"];
  const hasMultipleImages = product.images && product.images.length > 1;

  return (
    <div
      ref={feedRef}
      className="feed-container relative select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ─── Full-screen product image ─── */}
      <div
        className="absolute inset-0 z-0"
        onClick={() => handleDoubleTap(product.id)}
      >
        {product.images?.[currentImageIndex || 0] ? (
          <img
            src={product.images[currentImageIndex || 0]}
            alt={product.title}
            className="h-full w-full object-cover transition-all duration-500"
            loading="eager"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-violet-900/50 to-black grid place-items-center">
            <Package className="text-white/10" size={80} />
          </div>
        )}

        {/* Dark gradient overlay — bottom heavy for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40" />
      </div>

      {/* ─── Double-tap heart animation ─── */}
      {likeAnimation === product.id && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <Heart
            className="text-red-500 animate-like-burst"
            size={100}
            fill="currentColor"
          />
        </div>
      )}

      {/* ─── Top bar ─── */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-black text-white animate-pulse">
            🔴 LIVE
          </span>
          <span className="rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white/70">
            👁 {fakeViewers} se uită
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Music toggle */}
          <button
            onClick={toggleMusic}
            className="rounded-full bg-black/40 backdrop-blur-sm p-2 text-white/70 transition hover:bg-white/20"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          {/* Spinning music disc */}
          {!isMuted && (
            <div className="h-8 w-8 rounded-full border-2 border-white/30 bg-black/60 grid place-items-center animate-spin-slow">
              <Music size={10} className="text-white/60" />
            </div>
          )}
        </div>
      </div>

      {/* ─── Image pagination dots ─── */}
      {hasMultipleImages && (
        <div className="absolute top-14 left-0 right-0 z-10 flex justify-center gap-1.5">
          {product.images.slice(0, 6).map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentImageIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === (currentImageIndex || 0)
                  ? "w-6 bg-white"
                  : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}

      {/* ─── Image navigation arrows ─── */}
      {hasMultipleImages && (
        <>
          {currentImageIndex > 0 && (
            <button
              onClick={() => setCurrentImageIndex((i) => Math.max(0, i - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 backdrop-blur-sm p-2 text-white/60 transition hover:bg-black/50"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {currentImageIndex < product.images.length - 1 && (
            <button
              onClick={() => setCurrentImageIndex((i) => Math.min(product.images.length - 1, i + 1))}
              className="absolute right-14 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 backdrop-blur-sm p-2 text-white/60 transition hover:bg-black/50"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </>
      )}

      {/* ─── Right-side action buttons (TikTok style) ─── */}
      <div className="absolute right-3 bottom-44 z-10 flex flex-col items-center gap-5">
        {/* Like */}
        <button
          onClick={() => toggleLike(product.id)}
          className="flex flex-col items-center gap-1 transition active:scale-125"
        >
          <div className={`rounded-full p-2.5 ${likes[product.id] ? "bg-red-500/20" : "bg-black/30 backdrop-blur-sm"}`}>
            <Heart
              size={26}
              className={`transition-all ${likes[product.id] ? "text-red-500 scale-110" : "text-white"}`}
              fill={likes[product.id] ? "currentColor" : "none"}
            />
          </div>
          <span className="text-[11px] font-bold text-white/80">
            {(likeCounts[product.id] || 0).toLocaleString()}
          </span>
        </button>

        {/* Comments */}
        <button
          onClick={() => { setShowComments(true); setShowDetails(false); }}
          className="flex flex-col items-center gap-1 transition active:scale-110"
        >
          <div className="rounded-full bg-black/30 backdrop-blur-sm p-2.5">
            <MessageCircle size={26} className="text-white" />
          </div>
          <span className="text-[11px] font-bold text-white/80">
            {productComments.length}
          </span>
        </button>

        {/* Share */}
        <button className="flex flex-col items-center gap-1 transition active:scale-110">
          <div className="rounded-full bg-black/30 backdrop-blur-sm p-2.5">
            <Share2 size={24} className="text-white" />
          </div>
          <span className="text-[11px] font-bold text-white/80">Share</span>
        </button>

        {/* Add to cart */}
        <button
          onClick={() => {
            onAddToCart(product);
            if (isMuted) {
              startAmbientMusic();
              setIsMuted(false);
            }
          }}
          className="flex flex-col items-center gap-1 transition active:scale-110"
        >
          <div className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 p-3 shadow-lg shadow-violet-500/30 animate-pulse-glow">
            <ShoppingCart size={24} className="text-black" />
          </div>
          <span className="text-[11px] font-black text-emerald-400">Cumpără</span>
        </button>
      </div>

      {/* ─── Bottom product info ─── */}
      <div className="absolute bottom-4 left-0 right-16 z-10 px-4">
        {/* Category + deal label */}
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-full bg-violet-500/30 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-bold text-violet-300">
            {product.category || "General"}
          </span>
          {product.discountPercent > 0 && (
            <span className="rounded-full bg-red-500/80 px-2 py-0.5 text-[10px] font-black text-white">
              -{product.discountPercent}%
            </span>
          )}
          {product.qualityScore >= 8 && (
            <span className="rounded-full bg-amber-400/80 px-2 py-0.5 text-[10px] font-black text-black">
              ⭐ TOP
            </span>
          )}
        </div>

        {/* Title */}
        <h2 className="text-lg font-black leading-tight text-white drop-shadow-lg line-clamp-2">
          {product.title}
        </h2>

        {/* Price row */}
        <div className="mt-1.5 flex items-end gap-2">
          <span className="text-2xl font-black text-emerald-400 drop-shadow-lg">
            {product.price} lei
          </span>
          {product.oldPrice > product.price && (
            <span className="pb-0.5 text-sm text-white/40 line-through">
              {product.oldPrice} lei
            </span>
          )}
        </div>

        {/* Rating + delivery */}
        <div className="mt-1 flex items-center gap-3 text-[11px] text-white/50">
          {product.rating > 0 && (
            <span className="flex items-center gap-0.5 text-amber-300">
              <Star size={11} fill="currentColor" /> {product.rating.toFixed(1)}
            </span>
          )}
          {product.orders > 0 && (
            <span>{product.orders.toLocaleString()}+ vândute</span>
          )}
          <span className="flex items-center gap-0.5">
            <Truck size={11} /> ~{product.deliveryDays}z
          </span>
        </div>

        {/* Quick description */}
        {product.description && (
          <p className="mt-1.5 text-xs text-white/50 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        )}

        {/* Expand details button */}
        <button
          onClick={() => { setShowDetails(true); setShowComments(false); }}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:bg-white/20"
        >
          <ChevronUp size={14} /> Detalii · Mărimi · Poze
        </button>
      </div>

      {/* ─── Scroll indicators ─── */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-1 z-10 flex flex-col items-center gap-0.5">
        <ChevronDown size={16} className="text-white/30 animate-bounce" />
        <span className="text-[9px] text-white/20">{currentIndex + 1}/{products.length}</span>
      </div>

      {/* Navigate up/down buttons (desktop) */}
      {currentIndex > 0 && (
        <button
          onClick={() => { setCurrentIndex(currentIndex - 1); setCurrentImageIndex(0); setShowDetails(false); setShowComments(false); }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/30 backdrop-blur-sm p-1.5 text-white/40 transition hover:text-white hidden md:flex"
        >
          <ChevronUp size={20} />
        </button>
      )}

      {/* ─── Details bottom sheet ─── */}
      {showDetails && (
        <div
          className="absolute inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="w-full rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 max-h-[75vh] overflow-y-auto animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black">Detalii produs</h3>
              <button onClick={() => setShowDetails(false)} className="rounded-full bg-white/10 p-1.5">
                <X size={16} />
              </button>
            </div>

            {/* Image gallery */}
            {product.images && product.images.length > 1 && (
              <div className="mb-4">
                <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Galerie foto ({product.images.length})</p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {product.images.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`${product.title} ${i + 1}`}
                      className={`h-24 w-24 flex-shrink-0 rounded-xl object-cover cursor-pointer transition-all border-2 ${
                        i === currentImageIndex ? "border-violet-500 scale-105" : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                      onClick={() => { setCurrentImageIndex(i); setShowDetails(false); }}
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Size selector */}
            <div className="mb-4">
              <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Mărime</p>
              <div className="flex flex-wrap gap-2">
                {fakeSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size === selectedSize ? null : size)}
                    className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                      selectedSize === size
                        ? "border-violet-500 bg-violet-500/20 text-violet-300"
                        : "border-white/10 text-white/60 hover:border-white/30"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Full description */}
            <div className="mb-4">
              <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Descriere</p>
              <p className="text-sm text-white/70 leading-relaxed">{product.description}</p>
            </div>

            {/* Benefits */}
            {product.benefits && product.benefits.length > 0 && (
              <div className="mb-4 space-y-1.5">
                <p className="text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Beneficii</p>
                {product.benefits.map((b, i) => (
                  <div key={i} className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 px-3 py-2 text-sm text-emerald-300/80">
                    ✓ {b}
                  </div>
                ))}
              </div>
            )}

            {/* Why buy */}
            {product.whyBuy && (
              <div className="mb-4 rounded-xl bg-violet-500/10 border border-violet-500/20 p-3">
                <p className="text-xs font-bold text-violet-300">💎 De ce merită</p>
                <p className="mt-1 text-sm text-white/70">{product.whyBuy}</p>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => { onAddToCart(product); setShowDetails(false); }}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 py-4 text-base font-black text-black transition hover:scale-[1.01] active:scale-[0.99]"
            >
              🛒 Adaugă în coș — {product.price} lei
            </button>
          </div>
        </div>
      )}

      {/* ─── Comments bottom sheet ─── */}
      {showComments && (
        <div
          className="absolute inset-0 z-40 flex items-end bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowComments(false)}
        >
          <div
            className="w-full rounded-t-[2rem] border-t border-white/10 bg-[#0b0b12] p-5 max-h-[60vh] overflow-y-auto animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black">{productComments.length} Comentarii</h3>
              <button onClick={() => setShowComments(false)} className="rounded-full bg-white/10 p-1.5">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {productComments.map((comment, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`h-9 w-9 flex-shrink-0 rounded-full ${comment.color} grid place-items-center text-xs font-black`}>
                    {comment.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white/80">{comment.name}</span>
                      <span className="text-[10px] text-white/30">{comment.time}</span>
                    </div>
                    <p className="text-sm text-white/60 mt-0.5">{comment.text}</p>
                    <div className="flex items-center gap-4 mt-1.5">
                      <button className="text-[10px] text-white/30 hover:text-white/60">
                        ❤️ {Math.floor(Math.random() * 20) + 1}
                      </button>
                      <button className="text-[10px] text-white/30 hover:text-white/60">
                        Răspunde
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment input */}
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2.5">
              <input
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                placeholder="Adaugă un comentariu..."
              />
              <button className="rounded-full bg-violet-500 px-3 py-1.5 text-xs font-bold text-white">
                Trimite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
