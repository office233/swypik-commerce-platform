"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, Heart, Home, Minus, Package, Plus, Share2, ShoppingCart, Sparkles, Star, Truck, Users, X } from "lucide-react";
import { mergeIntoCart } from "@/types/cart";
import type { Product } from "@/types/product";

import type { ProductDetail } from "@/lib/products/get-product-detail";
import VideoSection from "./VideoSection";
import { useTranslations } from "next-intl";
import { SquadBuyModal } from "@/components/squad/SquadBuyModal";
import { isEnabledClient } from "@/lib/feature-flags-client";
import { SQUAD_DISCOUNT_PCT, SQUAD_REQUIRED_MEMBERS, squadPriceCents } from "@/lib/squad/config";

const SQUAD_ENABLED = isEnabledClient("squadBuy");
import { playCashRegisterSound } from "@/lib/audio/sfx";

/* Types */
type Variant = {
  id: string; skuId: string; name: string; priceRon: number;
  priceUsd: number; image: string | null; stock: number;
  color: string | null; size: string | null;
};
type ColorData = { image: string | null; sizes: { size: string; price: number; stock: number; skuId: string }[] };
type SimilarProduct = { id: string; title: string; price: number; oldPrice?: number; image: string; hasVideo: boolean; rating: number; ratingAvg?: number | null; ratingCount?: number };

function dedupeSizes(sizes: ColorData["sizes"]): ColorData["sizes"] {
  const bySize = new Map<string, ColorData["sizes"][number]>();
  for (const item of sizes) {
    const key = item.size.trim();
    if (!key) continue;
    const current = bySize.get(key);
    if (!current || (item.stock > 0 && current.stock <= 0) || item.price < current.price) {
      bySize.set(key, { ...item, size: key });
    }
  }
  return Array.from(bySize.values());
}

type Props = { initialData?: ProductDetail | null; initialVideos?: any[] };

export default function ProductClient({ initialData, initialVideos }: Props) {
  const t = useTranslations("product");
  const { id } = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<any>(initialData?.product || null);
  const [variants, setVariants] = useState<Variant[]>(initialData?.variants || []);
  const [colorMap, setColorMap] = useState<Record<string, ColorData>>(initialData?.colorMap || {});
  const [similar, setSimilar] = useState<SimilarProduct[]>(initialData?.similar || []);
  const [loading, setLoading] = useState(!initialData);

  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [squadModalOpen, setSquadModalOpen] = useState(false);

  const toggleSave = async () => {
    if (savePending) return;
    const next = !liked;
    setLiked(next);
    setSavePending(true);
    try {
      const res = await fetch(`/api/products/${id}/save`, {
        method: next ? "POST" : "DELETE",
        credentials: "include",
      });
      if (res.status === 401) {
        setLiked(!next);
        router.push(`/auth/login?next=/product/${id}`);
        return;
      }
      if (!res.ok) {
        setLiked(!next);
      }
    } catch {
      setLiked(!next);
    } finally {
      setSavePending(false);
    }
  };
  const [productVideos, setProductVideos] = useState<any[]>(initialVideos || []);
  const [activeTab, setActiveTab] = useState<"clips" | "details" | "reviews">("clips");
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  // Fetch save status + videos + similar in parallel (single waterfall pass)
  useEffect(() => {
    if (!id) return;
    let aborted = false;
    Promise.all([
      fetch(`/api/products/${id}/save`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/products/${id}/videos`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/products/similar?product_id=${id}&limit=8`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([saveData, videosData, similarData]) => {
      if (aborted) return;
      if (saveData && typeof saveData.saved === "boolean") setLiked(saveData.saved);
      if (videosData && Array.isArray(videosData.videos)) setProductVideos(videosData.videos);
      if (similarData?.products?.length) {
        const mapped: SimilarProduct[] = similarData.products.map((p: any) => ({
          id: p.id,
          title: p.title,
          price: p.price || 0,
          oldPrice: 0,
          image: p.image || "",
          hasVideo: false,
          rating: p.rating || 0,
          ratingAvg: p.rating || null,
          ratingCount: p.ratingCount || 0,
        }));
        setSimilar((prev) => (prev.length ? prev : mapped));
      }
    });
    return () => { aborted = true; };
  }, [id]);

  // Initialize color/size selection from initialData
  useEffect(() => {
    if (selectedColor) return;
    const colors = Object.keys(colorMap);
    if (!colors.length) return;

    setSelectedColor(colors[0]);
    const sizes = colorMap[colors[0]]?.sizes || [];
    if (sizes.length) setSelectedSize(sizes[0].size);
  }, [colorMap, selectedColor]);

  // Only fetch client-side if no initialData was provided (direct URL nav, etc.)
  useEffect(() => {
    if (initialData) return; // Server already provided data
    fetch(`/api/products/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) return;
        setProduct(data.product);
        setVariants(data.variants);
        setColorMap(data.colorMap || {});
        setSimilar(data.similar || []);

        // Select first color & size
        const colors = Object.keys(data.colorMap || {});
        if (colors.length) {
          setSelectedColor(colors[0]);
          const sizes = data.colorMap[colors[0]]?.sizes || [];
          if (sizes.length) setSelectedSize(sizes[0].size);
        }
      })
      .finally(() => setLoading(false));
  }, [id, initialData]);

  /* Loading State */
  if (loading) return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#E5E5E5] dark:border-[#1F1F1F] border-t-[#0D0D0D] dark:border-t-white" />
        <p className="mt-4 text-sm font-bold text-[#6E6E80] dark:text-[#A1A1AA]">{t("seIncarcaProdusul")}</p>
      </div>
    </div>
  );

  /* Not Found */
  if (!product) return (
    <div className="min-h-screen bg-white dark:bg-black flex flex-col items-center justify-center gap-4 px-6">
      <Package size={56} className="text-[#E5E5E5] dark:text-[#3F3F46]" />
      <p className="text-lg font-black text-[#0D0D0D] dark:text-white">{t("produsulNuAFost")}</p>
      <button onClick={() => router.push('/')} className="rounded-xl bg-[#0D0D0D] dark:bg-white px-6 py-3 text-sm font-bold text-white dark:text-black active:scale-95 transition-transform">

        {t("inapoiLaMagazin")}
      </button>
    </div>
  );

  const images = product.images || [];
  const title = product.titleRo || product.title;
  const selectedColorSizes = selectedColor ? dedupeSizes(colorMap[selectedColor]?.sizes || []) : [];
  const selectedSizeData = selectedColorSizes.find(s => s.size === selectedSize) || null;
  // Variant prices are raw cost (no markup); product.price has markup applied.
  // Ignore variant price when it's significantly below product price (>20% gap).
  const variantPrice = selectedSizeData?.price ?? 0;
  const currentPrice = variantPrice > 0 && variantPrice >= product.price * 0.8 ? variantPrice : product.price;
  const discount = product.oldPrice > currentPrice ? Math.round(((product.oldPrice - currentPrice) / product.oldPrice) * 100) : 0;

  // Current variant image
  const variantImage = selectedColor && colorMap[selectedColor]?.image;
  const displayImages = variantImage ? [variantImage, ...images.filter((i: string) => i !== variantImage)] : images;

  const currentStock = selectedSizeData?.stock ?? product.availableStock ?? 0;

  const handleAddToCart = async () => {
    // Build the cart item matching shared Product type
    const skuId = selectedSizeData?.skuId || null;

    const cartProduct: Partial<Product> & { id: string; title: string; price: number } = {
      id: String(product.id),
      pgId: product.pgId || undefined,
      aeProductId: product.aeProductId || undefined,
      videoId: productVideos[0]?.id ? String(productVideos[0].id) : undefined,
      title: product.titleRo || product.title,
      price: currentPrice,
      oldPrice: product.oldPrice,
      images: images,
      category: product.category || "General",
      skuId: skuId || undefined,
      selectedColor: selectedColor || undefined,
      selectedSize: selectedSize || undefined,
      description: "",
      benefits: [],
      dealLabel: "",
      whyBuy: "",
      warnings: [],
      discountPercent: discount,
      rating: product.rating || 0,
      orders: product.ordersCount || 0,
      deliveryDays: product.shipDaysMin || 7,
      gradient: "from-orange-500 to-pink-500",
      qualityScore: 8,
    };

    // Server-side cart (DB) — POST upserts the item under the active cart.
    try {
      const resp = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId: String(cartProduct.id),
          quantity: Math.min(10, qty),
          variantId: skuId || null,
          title: cartProduct.title,
          image: images[0] || null,
          priceCents: Math.round(Number(cartProduct.price) * 100),
          currency: "RON",
        }),
      });
      if (!resp.ok) {
        // Backend a respins (ex. anunt necumparabil, stoc, validare).
        // Nu mai afisam confirmarea falsa de "adaugat" — aratam eroarea reala.
        let msg = t("addToCartError");
        try {
          const data = await resp.json();
          if (data?.error && typeof data.error === "string") msg = data.error;
        } catch { /* raspuns non-JSON */ }
        setCartError(msg);
        setTimeout(() => setCartError(null), 4000);
        return;
      }
    } catch {
      setCartError(t("addToCartError"));
      setTimeout(() => setCartError(null), 4000);
      return;
    }

    setAddedToCart(true);
    playCashRegisterSound();
    setTimeout(() => setAddedToCart(false), 2500);
  };

  return (
    <main className="min-h-screen bg-white dark:bg-black pb-32" style={{ fontFamily: "'Inter', system-ui, sans-serif" }} aria-label={t("ariaPagina", { title: product.title })}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#E5E5E5] dark:border-[#1F1F1F] bg-white/95 dark:bg-black/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="grid h-11 w-11 place-items-center rounded-xl bg-[#F7F7F8] dark:bg-[#1F1F23] border border-[#E5E5E5] dark:border-[#1F1F1F] text-[#0D0D0D] dark:text-white active:scale-90 transition-transform" aria-label={t("inapoi")}>
          <ArrowLeft size={16} />
        </button>
        <span className="flex-1 text-sm font-semibold text-[#6E6E80] dark:text-[#A1A1AA] truncate">
          {product.category || t("produsFallback")}
        </span>
        <button onClick={toggleSave} disabled={savePending} className={`grid h-11 w-11 place-items-center rounded-xl border transition-all active:scale-90 disabled:opacity-60 ${liked ? 'bg-red-50 border-red-200 text-red-500' : 'bg-[#F7F7F8] dark:bg-[#1F1F23] border-[#E5E5E5] dark:border-[#1F1F1F] text-[#6E6E80] dark:text-[#A1A1AA]'}`} aria-label={t("salveaza")} aria-pressed={liked}>
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => router.push('/')} className="grid h-11 w-11 place-items-center rounded-xl bg-[#F7F7F8] dark:bg-[#1F1F23] border border-[#E5E5E5] dark:border-[#1F1F1F] text-[#0D0D0D] dark:text-white active:scale-90 transition-transform" aria-label={t("acasa")}>
          <Home size={16} />
        </button>
      </header>

      {/* Video / Image Gallery Header */}
      <div className="relative bg-[#000] w-full flex justify-center overflow-hidden" style={{ maxHeight: "min(70vh, calc(100vw * 16 / 9))" }}>
        {productVideos.length > 0 || (product.hasVideo && product.video) ? (
          <video
            src={productVideos.length > 0 ? productVideos[0].playbackUrl : product.video}
            autoPlay
            loop
            muted
            playsInline
            className="w-full sm:max-w-lg object-cover"
            style={{ maxHeight: "min(70vh, calc(100vw * 16 / 9))" }}
          />
        ) : (
          <div className="relative aspect-square w-full max-w-lg overflow-hidden bg-[#F7F7F8] dark:bg-[#1F1F23]">
            {displayImages[selectedImage] ? (
              <Image
                src={displayImages[selectedImage]}
                alt={title}
                fill
                priority
                sizes="100vw"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full grid place-items-center">
                <Package size={64} className="text-[#E5E5E5] dark:text-[#3F3F46]" />
              </div>
            )}
            {discount > 0 && (
              <span className="absolute top-3 right-3 rounded-full bg-[#DC2626] px-3 py-1.5 text-xs font-black text-white shadow-lg">
                -{discount}%
              </span>
            )}
            {displayImages.length > 1 && selectedImage > 0 && (
              <button onClick={() => setSelectedImage(selectedImage - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-white/90 dark:bg-black/90 shadow-lg border border-[#E5E5E5] dark:border-[#1F1F1F] text-[#0D0D0D] dark:text-white active:scale-90 transition-transform" aria-label={t("inapoi2")}>
                <ChevronLeft size={18} />
              </button>
            )}
            {displayImages.length > 1 && selectedImage < displayImages.length - 1 && (
              <button onClick={() => setSelectedImage(selectedImage + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-white/90 dark:bg-black/90 shadow-lg border border-[#E5E5E5] dark:border-[#1F1F1F] text-[#0D0D0D] dark:text-white active:scale-90 transition-transform" aria-label={t("inainte")}>
                <ChevronRight size={18} />
              </button>
            )}
            {displayImages.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {displayImages.slice(0, 8).map((_: string, i: number) => (
                  <button key={i} type="button" onClick={() => setSelectedImage(i)} aria-label={`Imaginea ${i + 1}`} className="hit-target-44 -m-2.5"><span className={`rounded-full transition-all block ${i === selectedImage ? 'w-6 h-2 bg-[#0D0D0D] dark:bg-white' : 'w-2 h-2 bg-[#0D0D0D]/30 dark:bg-white/40'}`} /></button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="px-4 pt-4 mobile-page-bottom">
        {/* Price */}
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-3xl font-black text-[#0D0D0D] dark:text-white">{currentPrice} lei</span>
          {product.oldPrice > currentPrice && (
            <span className="text-base text-[#52525B] dark:text-[#A1A1AA] line-through">{product.oldPrice} lei</span>
          )}
        </div>

        {/* Squad Buy Teaser Badge */}
        {SQUAD_ENABLED && (
        <div
          onClick={() => setSquadModalOpen(true)}
          className="cursor-pointer mb-3 rounded-2xl bg-gradient-to-r from-violet-600/10 via-pink-600/10 to-amber-500/10 border border-violet-500/30 p-3 flex items-center justify-between hover:border-violet-500/60 transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs shadow-md shrink-0">
              👥
            </div>
            <div>
              <p className="text-xs font-black text-[#0D0D0D] dark:text-white flex items-center gap-1.5">
                Cumpără în Squad de {SQUAD_REQUIRED_MEMBERS} <span className="bg-gradient-to-r from-violet-600 to-pink-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">-{SQUAD_DISCOUNT_PCT}% REDUCERE</span>
              </p>
              <p className="text-[11px] text-[#6E6E80] dark:text-[#A1A1AA]">
                Doar {(squadPriceCents(Math.round(currentPrice * 100)) / 100).toFixed(2)} lei când cumperi împreună cu un prieten
              </p>
            </div>
          </div>
          <span className="text-xs font-black text-violet-600 dark:text-violet-400 shrink-0">Vezi &rarr;</span>
        </div>
        )}

        {/* Title */}
        <h1 className="text-lg font-bold leading-snug text-[#0D0D0D] dark:text-white mb-3">
          {title}
        </h1>

        {Array.isArray(product.taxonomyPath) && product.taxonomyPath.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 mb-3 text-[12px] text-[#6E6E80] dark:text-[#A1A1AA]">
            <Link href="/categories" className="hover:underline">Categorii</Link>
            {product.taxonomyPath.map((node: { slug: string; label: string }, idx: number) => (
              <span key={node.slug} className="flex items-center gap-1">
                <span className="text-[#C7C7CD] dark:text-[#52525B]">/</span>
                {idx === product.taxonomyPath.length - 1 ? (
                  <span className="text-[#0D0D0D] dark:text-white font-medium">{node.label}</span>
                ) : (
                  <Link href={`/categories/${node.slug}`} className="hover:underline">{node.label}</Link>
                )}
              </span>
            ))}
          </nav>
        )}

        {/* Rating & Orders */}
        <div className="flex flex-wrap gap-3 text-sm font-medium text-[#6E6E80] dark:text-[#A1A1AA] mb-5">
          <span className="flex items-center gap-1">
            <Star size={14} className="text-[#B45309]" fill="currentColor" />
            {(product.rating ?? 0).toFixed(1)}
            {product.ratingCount && product.ratingCount > 0
              ? ` (${product.ratingCount} recenzii)`
              : ""}
          </span>
          <span className="flex items-center gap-1">
            <ShoppingCart size={14} />
            {product.ordersCount}  {t("vandute")}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-[#E5E5E5] dark:border-[#1F1F1F] mb-5 sticky top-[calc(68px+env(safe-area-inset-top))] bg-white dark:bg-black z-40 pb-2">
          <button onClick={() => setActiveTab("clips")} className={`inline-flex items-center px-3 py-3 min-h-[44px] text-sm font-black border-b-2 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 focus-visible:outline-none ${activeTab === "clips" ? "border-[#0D0D0D] dark:border-white text-[#0D0D0D] dark:text-white" : "border-transparent text-[#6E6E80] dark:text-[#A1A1AA]"}`}>
            Videoclipuri ({productVideos.length})
          </button>
          <button onClick={() => setActiveTab("details")} className={`inline-flex items-center px-3 py-3 min-h-[44px] text-sm font-black border-b-2 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 focus-visible:outline-none ${activeTab === "details" ? "border-[#0D0D0D] dark:border-white text-[#0D0D0D] dark:text-white" : "border-transparent text-[#6E6E80] dark:text-[#A1A1AA]"}`}>
            Detalii
          </button>
          <button onClick={() => setActiveTab("reviews")} className={`inline-flex items-center px-3 py-3 min-h-[44px] text-sm font-black border-b-2 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 focus-visible:outline-none ${activeTab === "reviews" ? "border-[#0D0D0D] dark:border-white text-[#0D0D0D] dark:text-white" : "border-transparent text-[#6E6E80] dark:text-[#A1A1AA]"}`}>
            Recenzii
          </button>
        </div>

        {/* Color Selector */}
        {Object.keys(colorMap).length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-bold text-[#0D0D0D] dark:text-white mb-2">
              Culoare: <span className="text-[#0D0D0D] dark:text-white">{selectedColor}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(colorMap).map(([color, data]) => (
                <button key={color} onClick={() => {
                  setSelectedColor(color);
                  setSelectedImage(0);
                  const sizes = dedupeSizes(data.sizes);
                  if (sizes.length && !sizes.find(s => s.size === selectedSize)) {
                    setSelectedSize(sizes[0].size);
                  }
                }}
                  aria-label={t("ariaSelectColor", { color })}
                  aria-pressed={selectedColor === color}
                  className={`rounded-xl border-2 transition-all active:scale-95 ${selectedColor === color ? 'border-[#0D0D0D] dark:border-white shadow-[0_0_0_1px_#0D0D0D] dark:shadow-[0_0_0_1px_#FFFFFF]' : 'border-[#E5E5E5] dark:border-[#1F1F1F] hover:border-[#D1D1D6] dark:hover:border-[#3F3F46]'}`}
                >
                  {data.image ? (
                    <Image src={data.image} alt={color} width={48} height={48} className="h-12 w-12 rounded-[10px] object-cover" />
                  ) : (
                    <span className={`block px-4 py-2.5 text-sm font-semibold ${selectedColor === color ? 'text-[#0D0D0D] dark:text-white' : 'text-[#6E6E80] dark:text-[#A1A1AA]'}`}>{color}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Size Selector */}
        {selectedColor && selectedColorSizes.length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-bold text-[#0D0D0D] dark:text-white mb-2">

              {t("marime")} <span className="text-[#0D0D0D] dark:text-white">{selectedSize}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedColorSizes.map(s => (
                <button key={s.size} onClick={() => setSelectedSize(s.size)}
                  disabled={s.stock === 0}
                  className={`rounded-xl px-5 py-2.5 text-sm font-bold border-2 transition-all active:scale-95
                    ${selectedSize === s.size
                      ? 'border-[#0D0D0D] dark:border-white bg-[#0D0D0D]/10 dark:bg-white/10 text-[#0D0D0D] dark:text-white'
                      : s.stock > 0
                        ? 'border-[#E5E5E5] dark:border-[#1F1F1F] text-[#0D0D0D] dark:text-white hover:border-[#D1D1D6] dark:hover:border-[#3F3F46]'
                        : 'border-[#E5E5E5] dark:border-[#1F1F1F] text-[#D1D1D6] dark:text-[#3F3F46] opacity-40 cursor-not-allowed'
                    }`}
                >
                  {s.size}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="flex items-center gap-4 mb-5">
          <span className="text-sm font-bold text-[#0D0D0D] dark:text-white">Cantitate:</span>
          <div className="flex items-center rounded-xl border border-[#E5E5E5] dark:border-[#1F1F1F] overflow-hidden">
            <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Minus" className="grid h-11 w-11 place-items-center text-[#6E6E80] dark:text-[#A1A1AA] hover:bg-[#F7F7F8] dark:hover:bg-[#1F1F23] active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none">
              <Minus size={16} />
            </button>
            <span className="w-10 text-center text-sm font-black text-[#0D0D0D] dark:text-white">{qty}</span>
            <button onClick={() => setQty(Math.min(10, qty + 1))} className="grid h-11 w-11 place-items-center text-[#6E6E80] dark:text-[#A1A1AA] hover:bg-[#F7F7F8] dark:hover:bg-[#1F1F23] active:scale-90 transition-all focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none" aria-label="Plus">
              <Plus size={16} />
            </button>
          </div>
          {currentStock > 0 && (
            <span className="text-xs font-semibold text-[#0D0D0D] dark:text-white bg-[#0D0D0D]/10 dark:bg-white/10 px-3 py-1.5 rounded-full">{currentStock}  {t("inStoc")}</span>
          )}
        </div>

        {/* Tabs Content */}
        {activeTab === "clips" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {productVideos.map((video) => (
              <button type="button" key={video.id} className="relative aspect-[9/16] rounded-xl overflow-hidden bg-black cursor-pointer group text-left w-full" onClick={() => setPlayingVideo(video.playbackUrl)} aria-label={t("redaClip")}>
                {video.thumbnailUrl ? (
                  <Image
                    src={video.thumbnailUrl}
                    alt={video.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Clapperboard size={36} /></div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm">
                    <div className="ml-1 h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-[#0D0D0D]"></div>
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 right-2 text-white text-[10px] font-bold line-clamp-2 drop-shadow-md">
                  {video.title}
                </div>
              </button>
            ))}
            {productVideos.length === 0 && (
              <p className="text-sm font-medium text-[#6E6E80] dark:text-[#A1A1AA] col-span-2 text-center py-10">{t("nuExistaClipuriPentru")}</p>
            )}
          </div>
        )}

        {activeTab === "details" && (
          <div className="space-y-5 animate-fadeIn">
            {/* Shipping Info */}
            <div className="rounded-2xl bg-[#F7F7F8] dark:bg-[#1F1F23] border border-[#E5E5E5] dark:border-[#1F1F1F] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-[#6E6E80] dark:text-[#A1A1AA]"><Truck size={16} /> {t("shipping")}</span>
                <span className={`text-sm font-bold ${product.shipFree ? 'text-[#0D0D0D] dark:text-white' : 'text-[#0D0D0D] dark:text-white'}`}>
                  {product.shipFree ? t("livrareGratuita") : t("livrareInclusa")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#6E6E80] dark:text-[#A1A1AA]">{t("estimare")}</span>
                <span className="text-sm font-semibold text-[#0D0D0D] dark:text-white">
                  {product.deliveryDate || `${product.shipDaysMin || 7}-${product.shipDaysMax || 15} zile`}
                </span>
              </div>
              {product.shipTracking && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#6E6E80] dark:text-[#A1A1AA]">{t("tracking")}</span>
                  <span className="text-sm font-bold text-[#0D0D0D] dark:text-white">{t("cuUrmarire")}</span>
                </div>
              )}
            </div>

            {/* Product Details */}
            {(() => {
              const details = [
                [t("attrMaterial"), product.material],
                [t("attrFabric"), product.fabricType],
                [t("attrStil"), product.style],
                [t("attrGuler"), product.neckline],
                [t("attrManeca"), product.sleeveStyle],
                [t("attrSilueta"), product.silhouette],
                [t("attrTalie"), product.waistline],
                [t("attrPattern"), product.patternType],
                [t("attrSezon"), product.season],
                [t("attrDecoratii"), product.decoration?.join?.(", ")],
                [t("attrBrand"), product.brand && product.brand !== 'NONE' ? product.brand : null],
              ].filter(([, v]) => v);

              return details.length > 0 ? (
                <div className="rounded-2xl bg-[#F7F7F8] dark:bg-[#1F1F23] border border-[#E5E5E5] dark:border-[#1F1F1F] p-4">
                  <h3 className="text-sm font-black text-[#0D0D0D] dark:text-white mb-3">{t("detaliiProdus")}</h3>
                  <div className="space-y-2">
                    {details.map(([label, value]) => (
                      <div key={label as string} className="flex justify-between text-sm border-b border-[#E5E5E5]/50 dark:border-white/10 pb-2 last:border-0 last:pb-0">
                        <span className="font-medium text-[#6E6E80] dark:text-[#A1A1AA]">{label}</span>
                        <span className="font-semibold text-[#0D0D0D] dark:text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Vânzător Swypik (link la storefront public) */}
            {product.seller && (
              <Link
                href={`/sellers/${product.seller.id}`}
                className="block rounded-2xl bg-white dark:bg-[#111113] border border-[#E5E5E5] dark:border-[#1F1F1F] p-4 hover:border-[#7C3AED]/60 active:scale-[0.99] transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#6E6E80] dark:text-[#A1A1AA] uppercase">{t("vandutDe")}</p>
                    <p className="text-sm font-black text-[#0D0D0D] dark:text-white">{product.seller.name}</p>
                  </div>
                  <span className="text-xs font-bold text-[#7C3AED]">{t("vezimagazin")}</span>
                </div>
              </Link>
            )}

            {/* Store Info (legacy AE source) */}
            {product.storeName && !product.seller && (
              <div className="rounded-2xl bg-[#F7F7F8] dark:bg-[#1F1F23] border border-[#E5E5E5] dark:border-[#1F1F1F] p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#6E6E80] dark:text-[#A1A1AA] uppercase">Magazin</p>
                  <p className="text-sm font-black text-[#0D0D0D] dark:text-white">{product.storeName}</p>
                </div>
                {product.storeRating > 0 && (
                  <div className="flex items-center gap-1 bg-[#B45309]/10 px-3 py-1.5 rounded-full">
                    <Star size={13} className="text-[#B45309]" fill="currentColor" />
                    <span className="text-sm font-black text-[#B45309]">{product.storeRating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Gallery Fallback in Details tab */}
            {displayImages.length > 1 && (
              <div className="mt-4">
                <h3 className="text-sm font-black text-[#0D0D0D] dark:text-white mb-3">Galerie foto</h3>
                <div className="grid grid-cols-2 gap-2">
                  {displayImages.map((img: string, i: number) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-[#F7F7F8] dark:bg-[#1F1F23]">
                      <Image src={img} alt="" fill sizes="50vw" className="object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="animate-fadeIn space-y-4">
            <div className="rounded-2xl bg-[#F7F7F8] dark:bg-[#1F1F23] border border-[#E5E5E5] dark:border-[#1F1F1F] p-6 text-center">
              <div className="text-4xl font-black text-[#0D0D0D] dark:text-white mb-1">{(product.rating ?? 0).toFixed(1)}</div>
              <div className="flex items-center justify-center gap-1 text-[#B45309] mb-2">
                {[1, 2, 3, 4, 5].map(i => <Star key={i} size={16} fill={i <= Math.round(product.rating || 0) ? 'currentColor' : 'none'} />)}
              </div>
              <p className="text-sm font-medium text-[#6E6E80] dark:text-[#A1A1AA]">
                {product.ratingCount && product.ratingCount > 0
                  ? t("recenziiVerificate", { count: product.ratingCount })
                  : product.ordersCount && product.ordersCount > 0
                    ? t("bazatPeComenzi", { count: product.ordersCount })
                    : t("produsNouFaraRecenzii")}
              </p>
            </div>
          </div>
        )}

        {/* Similar Products */}
        {similar.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] dark:text-[#A1A1AA] mb-3">{t("produseSimilare")}</h2>
            <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar">
              {similar.map(s => (
                <Link href={`/product/${s.id}`} key={s.id}
                  className="w-36 shrink-0 cursor-pointer rounded-2xl overflow-hidden bg-white dark:bg-[#111113] border border-[#E5E5E5] dark:border-[#1F1F1F] hover:shadow-md transition-all active:scale-95 text-left block" aria-label={s.title || t("produsSimilarFallback")}>
                  <div className="relative h-36 w-full">
                    <Image src={s.image} alt="" fill sizes="144px" className="object-cover" />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-semibold text-[#6E6E80] dark:text-[#A1A1AA] truncate">{s.title}</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-sm font-black text-[#0D0D0D] dark:text-white">{s.price} lei</span>
                      {s.oldPrice != null && s.oldPrice > s.price && (
                        <span className="text-[10px] text-[#52525B] dark:text-[#A1A1AA] line-through">{s.oldPrice} lei</span>
                      )}
                    </div>
                    {s.ratingAvg != null && (s.ratingCount ?? 0) > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#6E6E80] dark:text-[#A1A1AA]">
                        <Star size={11} className="text-[#B45309]" fill="currentColor" />
                        {s.ratingAvg.toFixed(1)}
                        <span className="text-[#52525B] dark:text-[#A1A1AA]">({s.ratingCount})</span>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {playingVideo && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 animate-fadeIn" onClick={() => setPlayingVideo(null)}>
          <button className="absolute top-4 right-4 grid h-11 w-11 place-items-center text-white rounded-full bg-white/10 backdrop-blur hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none" aria-label={t("inchide")} onClick={() => setPlayingVideo(null)}><X size={18} /></button>
          <video src={playingVideo} autoPlay controls playsInline className="w-full max-w-sm max-h-[80vh] rounded-2xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Fixed Bottom Bar — Cumpără singur (+ Squad Buy când e activ) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#E5E5E5] dark:border-[#1F1F1F] bg-white/95 dark:bg-black/95 backdrop-blur-xl px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-lg flex items-center gap-2">
          {process.env.NEXT_PUBLIC_FEATURE_TRY_ON === "1" && (
            <Link
              href={`/try-on/${product.id}`}
              aria-label={t("probeazaVirtual")}
              className="hidden sm:flex items-center justify-center rounded-2xl bg-[#7C3AED] p-3 text-white shadow-xl active:scale-95 transition-transform shrink-0"
            >
              <Sparkles size={18} />
            </Link>
          )}

          {/* CTA 1: Cumpără Singur */}
          <button
            type="button"
            onClick={handleAddToCart}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 py-3.5 px-3 text-xs font-black text-neutral-900 dark:text-white transition active:scale-95"
          >
            <ShoppingCart size={15} />
            <span>{addedToCart ? t("adaugatInCos") : `Singur • ${currentPrice} lei`}</span>
          </button>

          {SQUAD_ENABLED && (
          <button
            type="button"
            onClick={() => setSquadModalOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 py-3.5 px-3 text-xs sm:text-sm font-black text-white shadow-lg shadow-violet-600/30 transition active:scale-95"
          >
            <Users size={16} />
            <span>Squad • {(squadPriceCents(Math.round(currentPrice * 100)) / 100).toFixed(0)} lei (-{SQUAD_DISCOUNT_PCT}%)</span>
          </button>
          )}
        </div>
      </div>

      {/* Squad Buy Modal */}
      {SQUAD_ENABLED && (
      <SquadBuyModal
        isOpen={squadModalOpen}
        onClose={() => setSquadModalOpen(false)}
        product={{
          id: String(product.id),
          title: String(title),
          image: displayImages[0],
          price: Number(currentPrice),
        }}
      />
      )}

      {/* Toast */}
      {addedToCart && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0D0D0D] dark:bg-white px-5 py-2.5 text-sm font-black text-white dark:text-black shadow-xl animate-slideUp">
          {t("adaugatInCos")}
        </div>
      )}

      {/* Toast eroare — API a respins add-to-cart (ex. anunt necumparabil, stoc) */}
      {cartError && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 max-w-[90vw] rounded-2xl bg-red-600 px-5 py-2.5 text-center text-sm font-bold text-white shadow-xl animate-slideUp">
          {cartError}
        </div>
      )}
    </main>
  );
}
