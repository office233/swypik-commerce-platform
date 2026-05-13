/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useState } from "react";
import { X, ShoppingCart, Star, ChevronRight, ExternalLink } from "lucide-react";

interface ProductDrawerProps {
  product: any;
  onClose: () => void;
  onBuyNow: () => void;
}

export default function ProductDrawer({ product, onClose, onBuyNow }: ProductDrawerProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (!product) return null;

  const productImage = product.image || product.images?.[0] || product.image_url || null;
  const productName = product.name || product.title || "Produs";
  const productPrice = product.price || product.priceRon || "—";
  const productRating = product.rating || 4.5;
  const productReviews = product.ratingCount || product.reviews || 0;

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`} 
        onClick={handleClose}
      />
      
      {/* Drawer */}
      <div 
        className={`fixed bottom-0 left-0 right-0 h-[70vh] z-[70] bg-black/80 backdrop-blur-xl rounded-t-3xl border-t border-white/10 flex flex-col transform transition-transform duration-300 ease-out ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        
        {/* Header & Drag handle */}
        <div className="flex flex-col items-center p-4 border-b border-white/5 relative">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mb-3" />
          <div className="flex items-center justify-between w-full">
            <h3 className="text-white font-semibold text-lg line-clamp-1 pr-4">
              {productName}
            </h3>
            <button 
              onClick={handleClose} 
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          {/* Main Image */}
          <div className="w-full aspect-square bg-white/5 rounded-2xl overflow-hidden mb-5 relative shadow-lg">
            {productImage ? (
              <img
                src={productImage}
                alt={productName}
                className="w-full h-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <ShoppingCart className="w-16 h-16" />
              </div>
            )}
            {/* Rating floating badge */}
            {productRating > 0 && (
              <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 flex items-center gap-1 border border-white/10">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span className="text-white text-sm font-bold">{productRating}</span>
                {productReviews > 0 && <span className="text-gray-300 text-xs">({productReviews})</span>}
              </div>
            )}
          </div>

          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Preț</p>
              <h2 className="text-3xl font-bold text-[#0D0D0D]">{productPrice}</h2>
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-300 text-sm mb-6 leading-relaxed line-clamp-3">
            {product.description || "Descoperă acest produs premium pe Swypik. Adaugă-l în coș și bucură-te de o experiență de cumpărături rapidă și sigură!"}
          </p>

          <a 
            href={`/product/${product.id}`}
            className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors mb-6 group border border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#0D0D0D]/20 flex items-center justify-center text-[#0D0D0D]">
                <ExternalLink className="w-5 h-5" />
              </div>
              <span className="text-white font-medium">Vezi pagina produsului</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
          </a>
        </div>

        {/* Bottom Sticky Actions */}
        <div className="p-4 border-t border-white/10 bg-black/50 flex gap-3 pb-safe">
          <a 
            href={`/product/${product.id}`}
            className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-colors border border-white/10 active:scale-95 text-center"
          >
            Vezi detalii
          </a>
          <button 
            onClick={onBuyNow}
            className="flex-[1.5] py-4 bg-[#0D0D0D] hover:bg-[#0e8f6e] text-white rounded-xl font-bold shadow-[0_0_20px_rgba(16,163,127,0.3)] transition-all active:scale-95"
          >
            Cumpără acum
          </button>
        </div>
      </div>
    </>
  );
}
