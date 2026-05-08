"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Home, Minus, Package, Plus, Share2, ShoppingCart, Star, Truck } from "lucide-react";

/* ─── Types ──────────────────────────────────────────────── */
type Variant = {
  id: number; skuId: string; name: string; priceRon: number;
  priceUsd: number; image: string | null; stock: number;
  color: string | null; size: string | null;
};
type ColorData = { image: string | null; sizes: { size: string; price: number; stock: number; skuId: string }[] };
type SimilarProduct = { id: string; title: string; price: number; oldPrice: number; image: string; hasVideo: boolean; rating: number };

export default function ProductPage() {
  const { id } = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<any>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [colorMap, setColorMap] = useState<Record<string, ColorData>>({});
  const [similar, setSimilar] = useState<SimilarProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  useEffect(() => {
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
  }, [id]);

  /* ─── Loading State ─── */
  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#E5E5E5] border-t-[#10A37F]" />
        <p className="mt-4 text-sm font-bold text-[#6E6E80]">Se încarcă produsul...</p>
      </div>
    </div>
  );

  /* ─── Not Found ─── */
  if (!product) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6">
      <Package size={56} className="text-[#E5E5E5]" />
      <p className="text-lg font-black text-[#0D0D0D]">Produsul nu a fost găsit</p>
      <button onClick={() => router.push('/')} className="rounded-xl bg-[#0D0D0D] px-6 py-3 text-sm font-bold text-white active:scale-95 transition-transform">
        ← Înapoi la magazin
      </button>
    </div>
  );

  const images = product.images || [];
  const title = product.titleRo || product.title;
  const currentPrice = (() => {
    if (selectedColor && selectedSize && colorMap[selectedColor]) {
      const match = colorMap[selectedColor].sizes.find(s => s.size === selectedSize);
      if (match) return match.price;
    }
    return product.price;
  })();
  const discount = product.oldPrice > currentPrice ? Math.round(((product.oldPrice - currentPrice) / product.oldPrice) * 100) : 0;

  // Current variant image
  const variantImage = selectedColor && colorMap[selectedColor]?.image;
  const displayImages = variantImage ? [variantImage, ...images.filter((i: string) => i !== variantImage)] : images;

  const currentStock = (() => {
    if (selectedColor && selectedSize && colorMap[selectedColor]) {
      const match = colorMap[selectedColor].sizes.find(s => s.size === selectedSize);
      if (match) return match.stock;
    }
    return product.availableStock || 0;
  })();

  const handleAddToCart = () => {
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2500);
  };

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-[#E5E5E5] bg-white/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] text-[#0D0D0D] active:scale-90 transition-transform">
          <ArrowLeft size={16} />
        </button>
        <span className="flex-1 text-sm font-semibold text-[#6E6E80] truncate">
          {product.category || 'Produs'}
        </span>
        <button onClick={() => setLiked(!liked)} className={`grid h-9 w-9 place-items-center rounded-xl border transition-all active:scale-90 ${liked ? 'bg-red-50 border-red-200 text-red-500' : 'bg-[#F7F7F8] border-[#E5E5E5] text-[#6E6E80]'}`}>
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => router.push('/')} className="grid h-9 w-9 place-items-center rounded-xl bg-[#F7F7F8] border border-[#E5E5E5] text-[#0D0D0D] active:scale-90 transition-transform">
          <Home size={16} />
        </button>
      </header>

      {/* ── Image Gallery ── */}
      <div className="relative bg-[#F7F7F8]">
        <div className="aspect-square w-full overflow-hidden">
          {displayImages[selectedImage] ? (
            <img
              src={displayImages[selectedImage]}
              alt={title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full grid place-items-center">
              <Package size={64} className="text-[#E5E5E5]" />
            </div>
          )}
        </div>
        {product.hasVideo && product.video && (
          <span className="absolute top-3 left-3 rounded-full bg-[#0D0D0D] px-3 py-1 text-[10px] font-black text-white shadow-lg">
            🎬 Video
          </span>
        )}
        {discount > 0 && (
          <span className="absolute top-3 right-3 rounded-full bg-[#EF4444] px-3 py-1.5 text-xs font-black text-white shadow-lg">
            -{discount}%
          </span>
        )}
        {/* Image navigation arrows */}
        {displayImages.length > 1 && selectedImage > 0 && (
          <button onClick={() => setSelectedImage(selectedImage - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-lg border border-[#E5E5E5] text-[#0D0D0D] active:scale-90 transition-transform">
            <ChevronLeft size={18} />
          </button>
        )}
        {displayImages.length > 1 && selectedImage < displayImages.length - 1 && (
          <button onClick={() => setSelectedImage(selectedImage + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-lg border border-[#E5E5E5] text-[#0D0D0D] active:scale-90 transition-transform">
            <ChevronRight size={18} />
          </button>
        )}
        {/* Dots */}
        {displayImages.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {displayImages.slice(0, 8).map((_: string, i: number) => (
              <button key={i} onClick={() => setSelectedImage(i)} className={`rounded-full transition-all ${i === selectedImage ? 'w-6 h-2 bg-[#10A37F]' : 'w-2 h-2 bg-[#0D0D0D]/30'}`} />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {displayImages.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar border-b border-[#E5E5E5]">
          {displayImages.slice(0, 8).map((img: string, i: number) => (
            <img key={i} src={img} alt="" onClick={() => setSelectedImage(i)}
              className={`h-14 w-14 shrink-0 rounded-xl object-cover cursor-pointer transition-all ${selectedImage === i ? 'ring-2 ring-[#10A37F] opacity-100' : 'opacity-50 hover:opacity-80'}`}
            />
          ))}
        </div>
      )}

      {/* ── Product Info ── */}
      <div className="px-4 pt-4 pb-28">
        {/* Price */}
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-3xl font-black text-[#10A37F]">{currentPrice} lei</span>
          {product.oldPrice > currentPrice && (
            <span className="text-base text-[#A1A1AA] line-through">{product.oldPrice} lei</span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-lg font-bold leading-snug text-[#0D0D0D] mb-3">
          {title}
        </h1>

        {/* Rating & Orders */}
        <div className="flex flex-wrap gap-3 text-sm font-medium text-[#6E6E80] mb-5">
          <span className="flex items-center gap-1">
            <Star size={14} className="text-[#F59E0B]" fill="currentColor" />
            {product.rating?.toFixed(1)} ({product.ratingCount} review-uri)
          </span>
          <span className="flex items-center gap-1">
            <ShoppingCart size={14} />
            {product.ordersCount} vândute
          </span>
        </div>

        {/* ── Color Selector ── */}
        {Object.keys(colorMap).length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-bold text-[#0D0D0D] mb-2">
              Culoare: <span className="text-[#10A37F]">{selectedColor}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(colorMap).map(([color, data]) => (
                <button key={color} onClick={() => {
                  setSelectedColor(color);
                  setSelectedImage(0);
                  const sizes = data.sizes;
                  if (sizes.length && !sizes.find(s => s.size === selectedSize)) {
                    setSelectedSize(sizes[0].size);
                  }
                }}
                  className={`rounded-xl border-2 transition-all active:scale-95 ${selectedColor === color ? 'border-[#10A37F] shadow-[0_0_0_1px_#10A37F]' : 'border-[#E5E5E5] hover:border-[#D1D1D6]'}`}
                >
                  {data.image ? (
                    <img src={data.image} alt={color} className="h-12 w-12 rounded-[10px] object-cover" />
                  ) : (
                    <span className={`block px-4 py-2.5 text-sm font-semibold ${selectedColor === color ? 'text-[#10A37F]' : 'text-[#6E6E80]'}`}>{color}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Size Selector ── */}
        {selectedColor && colorMap[selectedColor]?.sizes.length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-bold text-[#0D0D0D] mb-2">
              Mărime: <span className="text-[#10A37F]">{selectedSize}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {colorMap[selectedColor].sizes.map(s => (
                <button key={s.size} onClick={() => setSelectedSize(s.size)}
                  disabled={s.stock === 0}
                  className={`rounded-xl px-5 py-2.5 text-sm font-bold border-2 transition-all active:scale-95
                    ${selectedSize === s.size
                      ? 'border-[#10A37F] bg-[#10A37F]/10 text-[#10A37F]'
                      : s.stock > 0
                        ? 'border-[#E5E5E5] text-[#0D0D0D] hover:border-[#D1D1D6]'
                        : 'border-[#E5E5E5] text-[#D1D1D6] opacity-40 cursor-not-allowed'
                    }`}
                >
                  {s.size}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Quantity ── */}
        <div className="flex items-center gap-4 mb-5">
          <span className="text-sm font-bold text-[#0D0D0D]">Cantitate:</span>
          <div className="flex items-center rounded-xl border border-[#E5E5E5] overflow-hidden">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-10 w-10 place-items-center text-[#6E6E80] hover:bg-[#F7F7F8] active:scale-90 transition-all">
              <Minus size={16} />
            </button>
            <span className="w-10 text-center text-sm font-black text-[#0D0D0D]">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="grid h-10 w-10 place-items-center text-[#6E6E80] hover:bg-[#F7F7F8] active:scale-90 transition-all">
              <Plus size={16} />
            </button>
          </div>
          {currentStock > 0 && (
            <span className="text-xs font-semibold text-[#10A37F] bg-[#10A37F]/10 px-3 py-1.5 rounded-full">📦 {currentStock} în stoc</span>
          )}
        </div>

        {/* ── Shipping Info ── */}
        <div className="rounded-2xl bg-[#F7F7F8] border border-[#E5E5E5] p-4 mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-[#6E6E80]"><Truck size={16} /> Livrare</span>
            <span className={`text-sm font-bold ${product.shipFree ? 'text-[#10A37F]' : 'text-[#0D0D0D]'}`}>
              {product.shipFree ? '✅ GRATUITĂ' : 'Inclusă în preț'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#6E6E80]">📅 Estimare</span>
            <span className="text-sm font-semibold text-[#0D0D0D]">
              {product.deliveryDate || `${product.shipDaysMin || 7}-${product.shipDaysMax || 15} zile`}
            </span>
          </div>
          {product.shipTracking && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#6E6E80]">📍 Tracking</span>
              <span className="text-sm font-bold text-[#10A37F]">✅ Cu urmărire</span>
            </div>
          )}
        </div>

        {/* ── Product Details ── */}
        {(() => {
          const details = [
            ['Material', product.material],
            ['Fabric', product.fabricType],
            ['Stil', product.style],
            ['Guler', product.neckline],
            ['Mânecă', product.sleeveStyle],
            ['Siluetă', product.silhouette],
            ['Talie', product.waistline],
            ['Pattern', product.patternType],
            ['Sezon', product.season],
            ['Decorații', product.decoration?.join?.(', ')],
            ['Brand', product.brand && product.brand !== 'NONE' ? product.brand : null],
          ].filter(([, v]) => v);

          return details.length > 0 ? (
            <div className="rounded-2xl bg-[#F7F7F8] border border-[#E5E5E5] p-4 mb-5">
              <h3 className="text-sm font-black text-[#0D0D0D] mb-3">📋 Detalii produs</h3>
              <div className="space-y-2">
                {details.map(([label, value]) => (
                  <div key={label as string} className="flex justify-between text-sm border-b border-[#E5E5E5]/50 pb-2 last:border-0 last:pb-0">
                    <span className="font-medium text-[#6E6E80]">{label}</span>
                    <span className="font-semibold text-[#0D0D0D]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null;
        })()}

        {/* ── Store Info ── */}
        {product.storeName && (
          <div className="rounded-2xl bg-[#F7F7F8] border border-[#E5E5E5] p-4 mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[#6E6E80] uppercase">Magazin</p>
              <p className="text-sm font-black text-[#0D0D0D]">{product.storeName}</p>
            </div>
            {product.storeRating > 0 && (
              <div className="flex items-center gap-1 bg-[#F59E0B]/10 px-3 py-1.5 rounded-full">
                <Star size={13} className="text-[#F59E0B]" fill="currentColor" />
                <span className="text-sm font-black text-[#F59E0B]">{product.storeRating.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Similar Products ── */}
        {similar.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#6E6E80] mb-3">Produse similare</h2>
            <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar">
              {similar.map(s => (
                <div key={s.id} onClick={() => router.push(`/product/${s.id}`)}
                  className="w-36 shrink-0 cursor-pointer rounded-2xl overflow-hidden bg-white border border-[#E5E5E5] hover:shadow-md transition-all active:scale-95">
                  <img src={s.image} alt="" className="h-36 w-full object-cover" />
                  <div className="p-2.5">
                    <p className="text-xs font-semibold text-[#6E6E80] truncate">{s.title}</p>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-sm font-black text-[#10A37F]">{s.price} lei</span>
                      {s.oldPrice > s.price && (
                        <span className="text-[10px] text-[#A1A1AA] line-through">{s.oldPrice}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed Bottom Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E5E5E5] bg-white/95 backdrop-blur-xl px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <div className="flex-1">
            <p className="text-2xl font-black text-[#10A37F]">{currentPrice} lei</p>
            <p className="text-[11px] font-medium text-[#6E6E80]">
              {selectedColor && selectedSize ? `${selectedColor} / ${selectedSize}` : 'Selectează varianta'}
            </p>
          </div>
          <button onClick={handleAddToCart}
            className="flex items-center gap-2 rounded-2xl bg-[#0D0D0D] px-6 py-3.5 text-sm font-black text-white shadow-xl active:scale-95 transition-transform">
            <ShoppingCart size={17} />
            {addedToCart ? '✓ Adăugat!' : 'Adaugă în coș'}
          </button>
        </div>
      </div>

      {/* ── Toast ── */}
      {addedToCart && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#10A37F] px-5 py-2.5 text-sm font-black text-white shadow-xl animate-slideUp">
          🛒 Adăugat în coș!
        </div>
      )}
    </div>
  );
}
