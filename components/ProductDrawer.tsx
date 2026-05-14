"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import { X, ShoppingCart, Star, ChevronRight, ExternalLink } from "lucide-react";
import { useFormatPrice } from "@/components/i18n/useFormatPrice";

export interface ProductData {
  id: string | number;
  name?: string;
  title?: string;
  image?: string | null;
  image_url?: string | null;
  images?: string[];
  price?: number;
  priceRon?: number;
  description?: string | null;
  rating?: number;
  ratingCount?: number;
  reviews?: number;
  videoId?: string;
  [key: string]: any;
}

interface ProductDrawerProps {
  /** Produs deja încărcat din feed — afișat instant fără fetch */
  product?: ProductData | null;
  /** Alias compat: dacă pasezi un produs minimal din feed */
  initialProduct?: ProductData | null;
  onClose: () => void;
  onBuyNow: () => void;
}

export default function ProductDrawer({ product, initialProduct, onClose, onBuyNow }: ProductDrawerProps) {
  const formatPrice = useFormatPrice();
  const seed = product ?? initialProduct ?? null;
  const [data, setData] = useState<ProductData | null>(seed);
  const [isVisible, setIsVisible] = useState(false);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Lazy enrichment: dacă produsul din feed e minimal (lipsă descriere/variante),
  // facem fetch în background, fără să blocăm afișarea inițială (latență 0ms).
  useEffect(() => {
    if (!seed?.id) return;
    const needsDetail = !seed.description || seed.description.length < 10;
    if (!needsDetail) return;
    let cancelled = false;
    setEnriching(true);
    fetch(`/api/products/${seed.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.product) return;
        setData((cur) => ({ ...(cur || {}), ...j.product, id: cur?.id ?? j.product.id }));
      })
      .catch(() => {})
      .finally(() => !cancelled && setEnriching(false));
    return () => { cancelled = true; };
  }, [seed?.id]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (!data) return null;

  const productImage = data.image || data.images?.[0] || data.image_url || null;
  const productName = data.name || data.title || "Produs";
  const rawPrice = data.price ?? data.priceRon;
  const productPriceDisplay = typeof rawPrice === "number"
    ? formatPrice(Math.round(rawPrice * 100), { sourceCurrency: "RON" })
    : "—";
  const productRating = data.rating || 4.5;
  const productReviews = data.ratingCount || data.reviews || 0;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      <div
        className={`fixed bottom-0 left-0 right-0 h-[70vh] z-[70] bg-black/80 backdrop-blur-xl rounded-t-3xl border-t border-white/10 flex flex-col transform transition-transform duration-300 ease-out ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="flex flex-col items-center p-4 border-b border-white/5 relative">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mb-3" />
          <div className="flex items-center justify-between w-full">
            <h3 className="text-white font-semibold text-lg line-clamp-1 pr-4">
              {productName}
            </h3>
            <button
              onClick={handleClose}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white transition-colors"
              aria-label="Închide"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          <div className="w-full aspect-square bg-white/5 rounded-2xl overflow-hidden mb-5 relative shadow-lg">
            {productImage ? (
              <Image
                src={productImage}
                alt={productName}
                fill
                sizes="(max-width: 640px) 92vw, 480px"
                className="object-cover"
                priority
                unoptimized={/\.gif($|\?)/i.test(productImage)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <ShoppingCart className="w-16 h-16" />
              </div>
            )}
            {productRating > 0 && (
              <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 flex items-center gap-1 border border-white/10 z-10">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span className="text-white text-sm font-bold">{productRating}</span>
                {productReviews > 0 && <span className="text-gray-300 text-xs">({productReviews})</span>}
              </div>
            )}
          </div>

          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Preț</p>
              <h2 className="text-3xl font-bold text-[#10A37F]">{productPriceDisplay}</h2>
            </div>
            {enriching && (
              <span className="text-[10px] uppercase tracking-wider text-white/40">Se încarcă detalii…</span>
            )}
          </div>

          <p className="text-gray-300 text-sm mb-6 leading-relaxed line-clamp-3">
            {data.description || "Descoperă acest produs premium pe Swypik. Adaugă-l în coș și bucură-te de o experiență de cumpărături rapidă și sigură!"}
          </p>

          <a
            href={`/product/${data.id}`}
            className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors mb-6 group border border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#10A37F]/20 flex items-center justify-center text-[#10A37F]">
                <ExternalLink className="w-5 h-5" />
              </div>
              <span className="text-white font-medium">Vezi pagina produsului</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
          </a>
        </div>

        <div className="p-4 border-t border-white/10 bg-black/50 flex gap-3 pb-safe">
          <a
            href={`/product/${data.id}`}
            className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors border border-white/10 active:scale-95 text-center"
          >
            Vezi detalii
          </a>
          <button
            onClick={onBuyNow}
            className="flex-[1.5] py-4 bg-[#10A37F] hover:bg-[#0e8f6e] text-white rounded-xl font-bold shadow-[0_0_20px_rgba(16,163,127,0.3)] transition-all active:scale-95"
          >
            Cumpără acum
          </button>
        </div>
      </div>
    </>
  );
}
