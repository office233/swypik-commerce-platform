"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f0f17', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#8b5cf6', fontSize: '18px', fontFamily: 'system-ui' }}>Se încarcă...</div>
    </div>
  );

  if (!product) return (
    <div style={{ minHeight: '100vh', background: '#0f0f17', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '48px' }}>😕</div>
      <div style={{ color: '#e2e8f0', fontSize: '18px', fontFamily: 'system-ui' }}>Produsul nu a fost găsit</div>
      <button onClick={() => router.push('/')} style={{ padding: '10px 24px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'system-ui' }}>
        ← Înapoi la magazin
      </button>
    </div>
  );

  const images = product.images || [];
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

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f17', color: '#e2e8f0', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── Header ── */}
      <header style={{ 
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(15,15,23,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(139,92,246,0.15)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px'
      }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#8b5cf6', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>
          ←
        </button>
        <span style={{ fontSize: '14px', color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {product.category || 'Produs'}
        </span>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}>
          🏠
        </button>
      </header>

      {/* ── Image Gallery ── */}
      <div style={{ position: 'relative', background: '#1a1a2e' }}>
        <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden' }}>
          <img 
            src={displayImages[selectedImage] || product.images?.[0]} 
            alt={product.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        {product.hasVideo && product.video && (
          <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.7)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#10b981' }}>
            🎬 Video
          </div>
        )}
        {discount > 0 && (
          <div style={{ position: 'absolute', top: '12px', right: '12px', background: '#ef4444', borderRadius: '6px', padding: '4px 10px', fontSize: '13px', fontWeight: '700', color: 'white' }}>
            -{discount}%
          </div>
        )}
        {/* Thumbnail strip */}
        {displayImages.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', overflowX: 'auto', background: 'rgba(0,0,0,0.3)' }}>
            {displayImages.slice(0, 8).map((img: string, i: number) => (
              <img key={i} src={img} alt="" onClick={() => setSelectedImage(i)}
                style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer',
                  border: selectedImage === i ? '2px solid #8b5cf6' : '2px solid transparent', opacity: selectedImage === i ? 1 : 0.6 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Product Info ── */}
      <div style={{ padding: '16px 20px' }}>
        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '28px', fontWeight: '800', color: '#8b5cf6' }}>{currentPrice} RON</span>
          {product.oldPrice > currentPrice && (
            <span style={{ fontSize: '16px', color: '#64748b', textDecoration: 'line-through' }}>{product.oldPrice} RON</span>
          )}
        </div>
        
        {/* Title */}
        <h1 style={{ fontSize: '16px', fontWeight: '600', lineHeight: '1.4', margin: '0 0 12px', color: '#e2e8f0' }}>
          {product.title}
        </h1>

        {/* Rating & Orders */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
          <span>⭐ {product.rating.toFixed(1)} ({product.ratingCount} review-uri)</span>
          <span>🛒 {product.ordersCount} vândute</span>
        </div>

        {/* ── Color Selector ── */}
        {Object.keys(colorMap).length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
              Culoare: <span style={{ color: '#e2e8f0', fontWeight: '600' }}>{selectedColor}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(colorMap).map(([color, data]) => (
                <button key={color} onClick={() => {
                  setSelectedColor(color);
                  setSelectedImage(0);
                  const sizes = data.sizes;
                  if (sizes.length && !sizes.find(s => s.size === selectedSize)) {
                    setSelectedSize(sizes[0].size);
                  }
                }}
                  style={{
                    padding: data.image ? '2px' : '8px 14px',
                    border: selectedColor === color ? '2px solid #8b5cf6' : '2px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', background: 'rgba(255,255,255,0.05)', cursor: 'pointer',
                    transition: 'all 0.2s', position: 'relative',
                  }}
                >
                  {data.image ? (
                    <img src={data.image} alt={color} style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px' }} />
                  ) : (
                    <span style={{ fontSize: '13px', color: selectedColor === color ? '#8b5cf6' : '#94a3b8' }}>{color}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Size Selector ── */}
        {selectedColor && colorMap[selectedColor]?.sizes.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
              Mărime: <span style={{ color: '#e2e8f0', fontWeight: '600' }}>{selectedSize}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {colorMap[selectedColor].sizes.map(s => (
                <button key={s.size} onClick={() => setSelectedSize(s.size)}
                  style={{
                    padding: '8px 18px', fontSize: '14px', fontWeight: '600',
                    border: selectedSize === s.size ? '2px solid #8b5cf6' : '2px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', background: selectedSize === s.size ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                    color: selectedSize === s.size ? '#8b5cf6' : '#94a3b8',
                    cursor: s.stock > 0 ? 'pointer' : 'not-allowed',
                    opacity: s.stock > 0 ? 1 : 0.4,
                    transition: 'all 0.2s',
                  }}
                >
                  {s.size}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Quantity ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>Cantitate:</span>
          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: '16px', cursor: 'pointer' }}>−</button>
            <span style={{ width: '40px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>{qty}</span>
            <button onClick={() => setQty(qty + 1)} style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: '16px', cursor: 'pointer' }}>+</button>
          </div>
          {currentStock > 0 && <span style={{ fontSize: '12px', color: '#10b981' }}>📦 {currentStock} în stoc</span>}
        </div>

        {/* ── Shipping Info ── */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>🚚 Livrare</span>
            <span style={{ fontSize: '13px', color: '#10b981', fontWeight: '600' }}>
              {product.shipFree ? '✅ GRATUITĂ' : `$${product.shipCostUsd} (inclus în preț)`}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>📅 Estimare</span>
            <span style={{ fontSize: '13px', color: '#e2e8f0' }}>
              {product.deliveryDate || `${product.shipDaysMin}-${product.shipDaysMax} zile`}
            </span>
          </div>
          {product.shipTracking && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>📍 Tracking</span>
              <span style={{ fontSize: '13px', color: '#10b981' }}>✅ Cu urmărire</span>
            </div>
          )}
        </div>

        {/* ── Product Details ── */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#e2e8f0' }}>📋 Detalii produs</div>
          {[
            ['Material', product.material],
            ['Fabric', product.fabricType],
            ['Stil', product.style],
            ['Neckline', product.neckline],
            ['Mânecă', product.sleeveStyle],
            ['Siluetă', product.silhouette],
            ['Talie', product.waistline],
            ['Pattern', product.patternType],
            ['Sezon', product.season],
            ['Decorații', product.decoration?.join(', ')],
            ['Brand', product.brand && product.brand !== 'NONE' ? product.brand : null],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</span>
              <span style={{ fontSize: '13px', color: '#e2e8f0' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Similar Products ── */}
      {similar.length > 0 && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>✨ Produse similare</h2>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {similar.map(s => (
              <div key={s.id} onClick={() => router.push(`/product/${s.id}`)}
                style={{ minWidth: '140px', cursor: 'pointer', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <img src={s.image} alt="" style={{ width: '140px', height: '140px', objectFit: 'cover' }} />
                <div style={{ padding: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#8b5cf6' }}>{s.price} RON</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fixed Bottom Bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(15,15,23,0.95)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(139,92,246,0.2)',
        padding: '12px 20px', display: 'flex', gap: '12px', alignItems: 'center',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#8b5cf6' }}>{currentPrice} RON</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {selectedColor && selectedSize ? `${selectedColor} / ${selectedSize}` : 'Selectează varianta'}
          </div>
        </div>
        <button style={{
          padding: '14px 32px', border: 'none', borderRadius: '12px',
          background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
          color: 'white', fontSize: '15px', fontWeight: '700', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
          transition: 'transform 0.2s',
        }}
          onMouseEnter={e => (e.target as HTMLElement).style.transform = 'scale(1.03)'}
          onMouseLeave={e => (e.target as HTMLElement).style.transform = 'scale(1)'}
        >
          🛒 Adaugă în coș
        </button>
      </div>

      {/* Bottom padding for fixed bar */}
      <div style={{ height: '80px' }} />
    </div>
  );
}
